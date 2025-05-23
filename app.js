// Configuration de l'API
const API_URL = 'https://web-service-a3zr.onrender.com';

// État de l'application
let state = {
    transactions: [],
    token: null,
    expenseCategories: ['Alimentation', 'Logement', 'Transport', 'Loisirs', 'Santé', 'Éducation', 'Vêtements', 'Factures', 'Autre dépense'],
    incomeCategories: ['Salaire', 'Freelance', 'Cadeaux', 'Investissements', 'Autre revenu'],
    chart: null
};

// Initialiser le token depuis localStorage si disponible
if (typeof localStorage !== 'undefined') {
    state.token = localStorage.getItem('token') || null;
}

// Fonctions d'initialisation
function init() {
    setupEventListeners();
    checkAuth();
    
    // Définir la date du jour pour les champs de date
    const transactionDateField = document.getElementById('transaction-date');
    if (transactionDateField) {
        transactionDateField.valueAsDate = new Date();
    }
}

function setupEventListeners() {
    // Formulaires d'authentification
    const loginForm = document.getElementById('login-form-elem');
    const registerForm = document.getElementById('register-form-elem');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
    
    // Déconnexion
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Formulaire de transaction
    const transactionForm = document.getElementById('transaction-form');
    if (transactionForm) {
        transactionForm.addEventListener('submit', handleAddTransaction);
    }
    
    // Filtres
    const applyFiltersBtn = document.getElementById('apply-filters');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', fetchTransactions);
    }
    
    // Édition de transaction
    const editForm = document.getElementById('edit-form');
    const deleteBtn = document.getElementById('delete-btn');
    
    if (editForm) {
        editForm.addEventListener('submit', handleUpdateTransaction);
    }
    if (deleteBtn) {
        deleteBtn.addEventListener('click', handleDeleteTransaction);
    }
    
    // Fermeture de la modal
    const closeBtn = document.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal();
        }
    });
}

function checkAuth() {
    if (state.token) {
        showDashboard();
    } else {
        showLoginPage();
    }
}

// Fonctions d'affichage
function showLoginPage() {
    const loginPage = document.getElementById('login-page');
    const dashboardPage = document.getElementById('dashboard-page');
    
    if (loginPage) {
        loginPage.classList.remove('hidden');
    }
    if (dashboardPage) {
        dashboardPage.classList.add('hidden');
    }
}

function showDashboard() {
    const loginPage = document.getElementById('login-page');
    const dashboardPage = document.getElementById('dashboard-page');
    
    if (loginPage) {
        loginPage.classList.add('hidden');
    }
    if (dashboardPage) {
        dashboardPage.classList.remove('hidden');
    }
    
    // Charger les données du dashboard
    fetchTransactions();
    fetchSummary();
    initChart();
}

function showTab(tabId) {
    // Masquer tous les formulaires
    document.querySelectorAll('.form-container').forEach(form => {
        form.classList.add('hidden');
    });
    
    // Désactiver tous les boutons d'onglet
    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Afficher le formulaire sélectionné
    const targetForm = document.getElementById(tabId);
    if (targetForm) {
        targetForm.classList.remove('hidden');
    }
    
    // Activer le bouton d'onglet correspondant
    const tabBtns = document.querySelectorAll('.tab-btn');
    if (tabId === 'login-form' && tabBtns[0]) {
        tabBtns[0].classList.add('active');
    } else if (tabBtns[1]) {
        tabBtns[1].classList.add('active');
    }
}

// Fonctions d'API
async function apiRequest(endpoint, method = 'GET', data = null) {
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }
    
    const config = {
        method,
        headers
    };
    
    if (data) {
        config.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(`${API_URL}${endpoint}`, config);
        
        if (response.status === 401) {
            // Token expiré ou invalide
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem('token');
            }
            state.token = null;
            showLoginPage();
            throw new Error('Session expirée. Veuillez vous reconnecter.');
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Erreur ${response.status}`);
        }
        
        // Pour les requêtes qui ne retournent pas de contenu
        if (response.status === 204) {
            return null;
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Fonctions d'authentification
async function handleLogin(e) {
    e.preventDefault();
    
    const usernameField = document.getElementById('login-username');
    const passwordField = document.getElementById('login-password');
    const errorElement = document.getElementById('login-error');
    const formElement = document.getElementById('login-form-elem');
    
    if (!usernameField || !passwordField) {
        return;
    }
    
    const username = usernameField.value;
    const password = passwordField.value;
    
    try {
        const response = await apiRequest('/login', 'POST', { username, password });
        
        if (response && response.token) {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('token', response.token);
            }
            state.token = response.token;
            
            if (errorElement) {
                errorElement.textContent = '';
            }
            if (formElement) {
                formElement.reset();
            }
            showDashboard();
        }
    } catch (error) {
        if (errorElement) {
            errorElement.textContent = 'Nom d\'utilisateur ou mot de passe incorrect';
        }
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const usernameField = document.getElementById('register-username');
    const passwordField = document.getElementById('register-password');
    const confirmPasswordField = document.getElementById('register-confirm-password');
    const errorElement = document.getElementById('register-error');
    const formElement = document.getElementById('register-form-elem');
    
    if (!usernameField || !passwordField || !confirmPasswordField) {
        return;
    }
    
    const username = usernameField.value;
    const password = passwordField.value;
    const confirmPassword = confirmPasswordField.value;
    
    if (password !== confirmPassword) {
        if (errorElement) {
            errorElement.textContent = 'Les mots de passe ne correspondent pas';
        }
        return;
    }
    
    try {
        const response = await apiRequest('/register', 'POST', { username, password });
        
        if (response && response.token) {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('token', response.token);
            }
            state.token = response.token;
            
            if (errorElement) {
                errorElement.textContent = '';
            }
            if (formElement) {
                formElement.reset();
            }
            showDashboard();
        }
    } catch (error) {
        if (errorElement) {
            errorElement.textContent = 'Cet utilisateur existe déjà ou une erreur est survenue';
        }
    }
}

function handleLogout() {
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('token');
    }
    state.token = null;
    showLoginPage();
}

// Fonctions de transactions
async function fetchTransactions() {
    try {
        // Récupérer les filtres
        const categoryField = document.getElementById('filter-category');
        const startDateField = document.getElementById('filter-start-date');
        const endDateField = document.getElementById('filter-end-date');
        
        const category = categoryField ? categoryField.value : '';
        const startDate = startDateField ? startDateField.value : '';
        const endDate = endDateField ? endDateField.value : '';
        
        // Construire l'URL avec les filtres
        let url = '/transactions';
        const params = [];
        
        if (category) params.push(`category=${encodeURIComponent(category)}`);
        if (startDate) params.push(`start_date=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`end_date=${encodeURIComponent(endDate)}`);
        
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        const transactions = await apiRequest(url);
        state.transactions = transactions || [];
        renderTransactions();
        updateChartData();
        
        // Mettre à jour le résumé si des filtres sont appliqués
        if (category || startDate || endDate) {
            fetchSummary(startDate, endDate);
        }
    } catch (error) {
        console.error('Erreur lors du chargement des transactions:', error);
    }
}

async function fetchSummary(startDate = '', endDate = '') {
    try {
        // Construire l'URL avec les filtres de date
        let url = '/summary';
        const params = [];
        
        if (startDate) params.push(`start_date=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`end_date=${encodeURIComponent(endDate)}`);
        
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        const summary = await apiRequest(url);
        renderSummary(summary);
    } catch (error) {
        console.error('Erreur lors du chargement du résumé:', error);
    }
}

async function handleAddTransaction(e) {
    e.preventDefault();
    
    const amountField = document.getElementById('transaction-amount');
    const typeField = document.querySelector('input[name="transaction-type"]:checked');
    const categoryField = document.getElementById('transaction-category');
    const descriptionField = document.getElementById('transaction-description');
    const dateField = document.getElementById('transaction-date');
    const formElement = document.getElementById('transaction-form');
    
    if (!amountField || !typeField || !categoryField || !dateField) {
        return;
    }
    
    const amount = parseFloat(amountField.value);
    const type = typeField.value;
    const category = categoryField.value;
    const description = descriptionField ? descriptionField.value : '';
    const date = dateField.value;
    
    try {
        await apiRequest('/transactions', 'POST', {
            amount,
            type,
            category,
            description,
            date
        });
        
        // Réinitialiser le formulaire
        if (formElement) {
            formElement.reset();
        }
        if (dateField) {
            dateField.valueAsDate = new Date();
        }
        
        // Actualiser les données
        fetchTransactions();
        fetchSummary();
    } catch (error) {
        console.error('Erreur lors de l\'ajout de la transaction:', error);
        alert('Erreur lors de l\'ajout de la transaction');
    }
}

async function handleUpdateTransaction(e) {
    e.preventDefault();
    
    const idField = document.getElementById('edit-id');
    const amountField = document.getElementById('edit-amount');
    const typeField = document.querySelector('input[name="edit-type"]:checked');
    const categoryField = document.getElementById('edit-category');
    const descriptionField = document.getElementById('edit-description');
    const dateField = document.getElementById('edit-date');
    
    if (!idField || !amountField || !typeField || !categoryField || !dateField) {
        return;
    }
    
    const id = idField.value;
    const amount = parseFloat(amountField.value);
    const type = typeField.value;
    const category = categoryField.value;
    const description = descriptionField ? descriptionField.value : '';
    const date = dateField.value;
    
    try {
        await apiRequest(`/transactions/${id}`, 'PUT', {
            amount,
            type,
            category,
            description,
            date
        });
        
        closeModal();
        
        // Actualiser les données
        fetchTransactions();
        fetchSummary();
    } catch (error) {
        console.error('Erreur lors de la modification de la transaction:', error);
        alert('Erreur lors de la modification de la transaction');
    }
}

async function handleDeleteTransaction() {
    const idField = document.getElementById('edit-id');
    
    if (!idField) {
        return;
    }
    
    const id = idField.value;
    
    if (confirm('Êtes-vous sûr de vouloir supprimer cette transaction ?')) {
        try {
            await apiRequest(`/transactions/${id}`, 'DELETE');
            
            closeModal();
            
            // Actualiser les données
            fetchTransactions();
            fetchSummary();
        } catch (error) {
            console.error('Erreur lors de la suppression de la transaction:', error);
            alert('Erreur lors de la suppression de la transaction');
        }
    }
}

// Fonctions de rendu
function renderTransactions() {
    const container = document.getElementById('transactions-container');
    
    if (!container) {
        return;
    }
    
    if (state.transactions.length === 0) {
        container.innerHTML = '<p class="empty-message">Aucune transaction à afficher</p>';
        return;
    }
    
    const transactionsHTML = state.transactions.map(transaction => {
        const isIncome = transaction.type === 'income';
        const amountClass = isIncome ? 'income' : 'expense';
        const amountPrefix = isIncome ? '+' : '-';
        const formattedAmount = formatCurrency(Math.abs(transaction.amount));
        
        return `
            <div class="transaction-item" data-id="${transaction.id}">
                <div class="transaction-info">
                    <h3>${transaction.category}</h3>
                    <p>${transaction.description || 'Sans description'} • ${formatDate(transaction.date)}</p>
                </div>
                <div class="transaction-amount ${amountClass}">
                    ${amountPrefix}${formattedAmount}
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = transactionsHTML;
    
    // Ajouter les écouteurs d'événements pour l'édition
    document.querySelectorAll('.transaction-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-id');
            const transaction = state.transactions.find(t => t.id === parseInt(id));
            
            if (transaction) {
                openEditModal(transaction);
            }
        });
    });
}

function renderSummary(summary) {
    if (!summary) {
        return;
    }
    
    const totalIncomeElement = document.getElementById('total-income');
    const totalExpenseElement = document.getElementById('total-expense');
    const balanceElement = document.getElementById('balance');
    
    if (totalIncomeElement) {
        totalIncomeElement.textContent = formatCurrency(summary.total_income);
    }
    if (totalExpenseElement) {
        totalExpenseElement.textContent = formatCurrency(summary.total_expense);
    }
    
    if (balanceElement) {
        balanceElement.textContent = formatCurrency(summary.balance);
        
        // Ajouter une classe en fonction du solde
        balanceElement.className = 'amount';
        if (summary.balance > 0) {
            balanceElement.classList.add('income');
        } else if (summary.balance < 0) {
            balanceElement.classList.add('expense');
        }
    }
}

// Fonctions utilitaires
function formatCurrency(amount) {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'XOF',
    }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR').format(date);
}

function openEditModal(transaction) {
    const modal = document.getElementById('edit-modal');
    
    if (!modal) {
        return;
    }
    
    // Remplir le formulaire avec les données de la transaction
    const idField = document.getElementById('edit-id');
    const amountField = document.getElementById('edit-amount');
    const categoryField = document.getElementById('edit-category');
    const descriptionField = document.getElementById('edit-description');
    const dateField = document.getElementById('edit-date');
    
    if (idField) idField.value = transaction.id;
    if (amountField) amountField.value = transaction.amount;
    if (categoryField) categoryField.value = transaction.category;
    if (descriptionField) descriptionField.value = transaction.description || '';
    if (dateField) dateField.value = transaction.date;
    
    // Sélectionner le type de transaction
    const incomeRadio = document.querySelector('input[name="edit-type"][value="income"]');
    const expenseRadio = document.querySelector('input[name="edit-type"][value="expense"]');
    
    if (transaction.type === 'income' && incomeRadio) {
        incomeRadio.checked = true;
    } else if (expenseRadio) {
        expenseRadio.checked = true;
    }
    
    // Afficher la modal
    modal.style.display = 'block';
}

function closeModal() {
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Fonctions liées aux graphiques
function initChart() {
    const chartCanvas = document.getElementById('expense-chart');
    
    if (!chartCanvas || typeof Chart === 'undefined') {
        return;
    }
    
    const ctx = chartCanvas.getContext('2d');
    
    state.chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    '#4361ee', '#3a0ca3', '#f72585', '#4cc9f0', '#4caf50',
                    '#ff9800', '#e91e63', '#2196f3', '#9c27b0', '#607d8b'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        font: {
                            size: 10
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Répartition des dépenses par catégorie',
                    font: {
                        size: 14
                    }
                }
            }
        }
    });
}

function updateChartData() {
    if (!state.chart) {
        return;
    }
    
    // Filtrer les transactions pour n'avoir que les dépenses
    const expenses = state.transactions.filter(t => t.type === 'expense');
    
    // Regrouper par catégorie
    const expensesByCategory = {};
    expenses.forEach(expense => {
        if (!expensesByCategory[expense.category]) {
            expensesByCategory[expense.category] = 0;
        }
        expensesByCategory[expense.category] += expense.amount;
    });
    
    // Préparer les données pour le graphique
    const labels = Object.keys(expensesByCategory);
    const data = Object.values(expensesByCategory);
    
    // Mettre à jour le graphique
    state.chart.data.labels = labels;
    state.chart.data.datasets[0].data = data;
    state.chart.update();
}

// Initialiser l'application au chargement
document.addEventListener('DOMContentLoaded', init);