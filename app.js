// Configuration de l'API
const API_URL = 'https://web-service-a3zr.onrender.com';

// État de l'application
let state = {
    transactions: [],
    token: localStorage.getItem('token') || null,
    expenseCategories: ['Alimentation', 'Logement', 'Transport', 'Loisirs', 'Santé', 'Éducation', 'Vêtements', 'Factures', 'Autre dépense'],
    incomeCategories: ['Salaire', 'Freelance', 'Cadeaux', 'Investissements', 'Autre revenu'],
    chart: null
};

// Fonctions d'initialisation
function init() {
    setupEventListeners();
    checkAuth();
    
    // Définir la date du jour pour les champs de date
    document.getElementById('transaction-date').valueAsDate = new Date();
}

function setupEventListeners() {
    // Formulaires d'authentification
    document.getElementById('login-form-elem').addEventListener('submit', handleLogin);
    document.getElementById('register-form-elem').addEventListener('submit', handleRegister);
    
    // Déconnexion
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // Formulaire de transaction
    document.getElementById('transaction-form').addEventListener('submit', handleAddTransaction);
    
    // Filtres
    document.getElementById('apply-filters').addEventListener('click', fetchTransactions);
    
    // Édition de transaction
    document.getElementById('edit-form').addEventListener('submit', handleUpdateTransaction);
    document.getElementById('delete-btn').addEventListener('click', handleDeleteTransaction);
    
    // Fermeture de la modal
    document.querySelector('.close-btn').addEventListener('click', closeModal);
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
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('dashboard-page').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('dashboard-page').classList.remove('hidden');
    
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
    document.getElementById(tabId).classList.remove('hidden');
    
    // Activer le bouton d'onglet correspondant
    if (tabId === 'login-form') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
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
            localStorage.removeItem('token');
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
    
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await apiRequest('/login', 'POST', { username, password });
        
        if (response && response.token) {
            localStorage.setItem('token', response.token);
            state.token = response.token;
            document.getElementById('login-error').textContent = '';
            document.getElementById('login-form-elem').reset();
            showDashboard();
        }
    } catch (error) {
        document.getElementById('login-error').textContent = 'Nom d\'utilisateur ou mot de passe incorrect';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    
    if (password !== confirmPassword) {
        document.getElementById('register-error').textContent = 'Les mots de passe ne correspondent pas';
        return;
    }
    
    try {
        const response = await apiRequest('/register', 'POST', { username, password });
        
        if (response && response.token) {
            localStorage.setItem('token', response.token);
            state.token = response.token;
            document.getElementById('register-error').textContent = '';
            document.getElementById('register-form-elem').reset();
            showDashboard();
        }
    } catch (error) {
        document.getElementById('register-error').textContent = 'Cet utilisateur existe déjà ou une erreur est survenue';
    }
}

function handleLogout() {
    localStorage.removeItem('token');
    state.token = null;
    showLoginPage();
}

// Fonctions de transactions
async function fetchTransactions() {
    try {
        // Récupérer les filtres
        const category = document.getElementById('filter-category').value;
        const startDate = document.getElementById('filter-start-date').value;
        const endDate = document.getElementById('filter-end-date').value;
        
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
    
    const amount = parseFloat(document.getElementById('transaction-amount').value);
    const type = document.querySelector('input[name="transaction-type"]:checked').value;
    const category = document.getElementById('transaction-category').value;
    const description = document.getElementById('transaction-description').value;
    const date = document.getElementById('transaction-date').value;
    
    try {
        await apiRequest('/transactions', 'POST', {
            amount,
            type,
            category,
            description,
            date
        });
        
        // Réinitialiser le formulaire
        document.getElementById('transaction-form').reset();
        document.getElementById('transaction-date').valueAsDate = new Date();
        
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
    
    const id = document.getElementById('edit-id').value;
    const amount = parseFloat(document.getElementById('edit-amount').value);
    const type = document.querySelector('input[name="edit-type"]:checked').value;
    const category = document.getElementById('edit-category').value;
    const description = document.getElementById('edit-description').value;
    const date = document.getElementById('edit-date').value;
    
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
    const id = document.getElementById('edit-id').value;
    
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
    document.getElementById('total-income').textContent = formatCurrency(summary.total_income);
    document.getElementById('total-expense').textContent = formatCurrency(summary.total_expense);
    
    const balanceElement = document.getElementById('balance');
    balanceElement.textContent = formatCurrency(summary.balance);
    
    // Ajouter une classe en fonction du solde
    balanceElement.className = 'amount';
    if (summary.balance > 0) {
        balanceElement.classList.add('income');
    } else if (summary.balance < 0) {
        balanceElement.classList.add('expense');
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
    // Remplir le formulaire avec les données de la transaction
    document.getElementById('edit-id').value = transaction.id;
    document.getElementById('edit-amount').value = transaction.amount;
    document.getElementById('edit-category').value = transaction.category;
    document.getElementById('edit-description').value = transaction.description || '';
    document.getElementById('edit-date').value = transaction.date;
    
    // Sélectionner le type de transaction
    const incomeRadio = document.querySelector('input[name="edit-type"][value="income"]');
    const expenseRadio = document.querySelector('input[name="edit-type"][value="expense"]');
    
    if (transaction.type === 'income') {
        incomeRadio.checked = true;
    } else {
        expenseRadio.checked = true;
    }
    
    // Afficher la modal
    document.getElementById('edit-modal').style.display = 'block';
}

function closeModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

// Fonctions liées aux graphiques
function initChart() {
    const ctx = document.getElementById('expense-chart').getContext('2d');
    
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