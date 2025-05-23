package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/dgrijalva/jwt-go"
	"github.com/gorilla/mux"
	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"
)

// Structures de données
type User struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type Transaction struct {
	ID          int     `json:"id"`
	UserID      int     `json:"user_id"`
	Amount      float64 `json:"amount"`
	Type        string  `json:"type"` // "expense" ou "income"
	Category    string  `json:"category"`
	Description string  `json:"description"`
	Date        string  `json:"date"`
}

type Summary struct {
	TotalIncome  float64 `json:"total_income"`
	TotalExpense float64 `json:"total_expense"`
	Balance      float64 `json:"balance"`
}

type Credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type JWTClaim struct {
	UserID int    `json:"user_id"`
	User   string `json:"user"`
	jwt.StandardClaims
}

var db *sql.DB
var jwtKey = []byte("votre_clé_secrète") // À changer en production

func main() {
	// Initialisation de la base de données
	initDB()

	// Configuration du routeur
	router := mux.NewRouter()

	// Routes publiques
	router.HandleFunc("/register", registerHandler).Methods("POST")
	router.HandleFunc("/login", loginHandler).Methods("POST")

	// Routes protégées
	api := router.PathPrefix("").Subrouter()
	api.Use(JWTMiddleware)
	api.HandleFunc("/transactions", createTransactionHandler).Methods("POST")
	api.HandleFunc("/transactions", getTransactionsHandler).Methods("GET")
	api.HandleFunc("/transactions/{id}", updateTransactionHandler).Methods("PUT")
	api.HandleFunc("/transactions/{id}", deleteTransactionHandler).Methods("DELETE")
	api.HandleFunc("/summary", getSummaryHandler).Methods("GET")

	// Configuration CORS
	corsHandler := func(h http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			h.ServeHTTP(w, r)
		})
	}

	// Démarrage du serveur
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Serveur démarré sur le port %s...\n", port)
	log.Fatal(http.ListenAndServe(":"+port, corsHandler(router)))
}

func initDB() {
	var err error
	db, err = sql.Open("sqlite3", "./expense_tracker.db")
	if err != nil {
		log.Fatal(err)
	}

	// Création des tables
	createTablesSQL := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL
	);
	
	CREATE TABLE IF NOT EXISTS transactions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER,
		amount REAL NOT NULL,
		type TEXT NOT NULL,
		category TEXT NOT NULL,
		description TEXT,
		date TEXT NOT NULL,
		FOREIGN KEY (user_id) REFERENCES users (id)
	);
	`

	_, err = db.Exec(createTablesSQL)
	if err != nil {
		log.Fatal(err)
	}
}

// Middleware JWT pour l'authentification
func JWTMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenString := r.Header.Get("Authorization")
		if tokenString == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Enlever le préfixe "Bearer "
		if len(tokenString) > 7 && tokenString[:7] == "Bearer " {
			tokenString = tokenString[7:]
		}

		claims := &JWTClaim{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return jwtKey, nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Ajouter l'ID utilisateur au contexte de la requête
		ctx := r.Context()
		r = r.WithContext(ctx)

		// Continuer vers le handler
		next.ServeHTTP(w, r)
	})
}

// Génération d'un token JWT
func generateToken(user User) (string, error) {
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &JWTClaim{
		UserID: user.ID,
		User:   user.Username,
		StandardClaims: jwt.StandardClaims{
			ExpiresAt: expirationTime.Unix(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtKey)
}

// Handlers
func registerHandler(w http.ResponseWriter, r *http.Request) {
	var creds Credentials
	err := json.NewDecoder(r.Body).Decode(&creds)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Hachage du mot de passe
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(creds.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Insertion de l'utilisateur
	stmt, err := db.Prepare("INSERT INTO users (username, password) VALUES (?, ?)")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	result, err := stmt.Exec(creds.Username, string(hashedPassword))
	if err != nil {
		http.Error(w, "Username already exists", http.StatusConflict)
		return
	}

	userID, _ := result.LastInsertId()
	user := User{
		ID:       int(userID),
		Username: creds.Username,
		Password: "",
	}

	// Génération du token
	token, err := generateToken(user)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Réponse
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"token": token,
	})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	var creds Credentials
	err := json.NewDecoder(r.Body).Decode(&creds)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Récupération de l'utilisateur
	var user User
	err = db.QueryRow("SELECT id, username, password FROM users WHERE username = ?", creds.Username).Scan(&user.ID, &user.Username, &user.Password)
	if err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Vérification du mot de passe
	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(creds.Password))
	if err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Génération du token
	token, err := generateToken(user)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Réponse
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"token": token,
	})
}

func getUserIDFromToken(r *http.Request) (int, error) {
	tokenString := r.Header.Get("Authorization")
	if len(tokenString) > 7 && tokenString[:7] == "Bearer " {
		tokenString = tokenString[7:]
	}

	claims := &JWTClaim{}
	_, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})

	if err != nil {
		return 0, err
	}

	return claims.UserID, nil
}

func createTransactionHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserIDFromToken(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var transaction Transaction
	err = json.NewDecoder(r.Body).Decode(&transaction)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	transaction.UserID = userID

	// Insertion de la transaction
	stmt, err := db.Prepare("INSERT INTO transactions (user_id, amount, type, category, description, date) VALUES (?, ?, ?, ?, ?, ?)")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	result, err := stmt.Exec(transaction.UserID, transaction.Amount, transaction.Type, transaction.Category, transaction.Description, transaction.Date)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	transaction.ID = int(id)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(transaction)
}

func getTransactionsHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserIDFromToken(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Filtres optionnels
	category := r.URL.Query().Get("category")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	// Construction de la requête SQL avec filtres
	query := "SELECT id, user_id, amount, type, category, description, date FROM transactions WHERE user_id = ?"
	args := []interface{}{userID}

	if category != "" {
		query += " AND category = ?"
		args = append(args, category)
	}

	if startDate != "" {
		query += " AND date >= ?"
		args = append(args, startDate)
	}

	if endDate != "" {
		query += " AND date <= ?"
		args = append(args, endDate)
	}

	query += " ORDER BY date DESC"

	rows, err := db.Query(query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	transactions := []Transaction{}
	for rows.Next() {
		var t Transaction
		err := rows.Scan(&t.ID, &t.UserID, &t.Amount, &t.Type, &t.Category, &t.Description, &t.Date)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		transactions = append(transactions, t)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transactions)
}

func updateTransactionHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserIDFromToken(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	params := mux.Vars(r)
	id, err := strconv.Atoi(params["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var transaction Transaction
	err = json.NewDecoder(r.Body).Decode(&transaction)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Vérifier que la transaction appartient à l'utilisateur
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM transactions WHERE id = ? AND user_id = ?", id, userID).Scan(&count)
	if err != nil || count == 0 {
		http.Error(w, "Transaction not found", http.StatusNotFound)
		return
	}

	// Mise à jour de la transaction
	stmt, err := db.Prepare("UPDATE transactions SET amount = ?, type = ?, category = ?, description = ?, date = ? WHERE id = ? AND user_id = ?")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer stmt.Close()

	_, err = stmt.Exec(transaction.Amount, transaction.Type, transaction.Category, transaction.Description, transaction.Date, id, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	transaction.ID = id
	transaction.UserID = userID

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transaction)
}

func deleteTransactionHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserIDFromToken(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	params := mux.Vars(r)
	id, err := strconv.Atoi(params["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Vérifier que la transaction appartient à l'utilisateur
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM transactions WHERE id = ? AND user_id = ?", id, userID).Scan(&count)
	if err != nil || count == 0 {
		http.Error(w, "Transaction not found", http.StatusNotFound)
		return
	}

	// Suppression de la transaction
	_, err = db.Exec("DELETE FROM transactions WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func getSummaryHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := getUserIDFromToken(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Filtres optionnels
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	// Construction des requêtes pour les revenus et dépenses
	incomeQuery := "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = ? AND type = 'income'"
	expenseQuery := "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = ? AND type = 'expense'"

	argsIncome := []interface{}{userID}
	argsExpense := []interface{}{userID}

	if startDate != "" {
		incomeQuery += " AND date >= ?"
		expenseQuery += " AND date >= ?"
		argsIncome = append(argsIncome, startDate)
		argsExpense = append(argsExpense, startDate)
	}

	if endDate != "" {
		incomeQuery += " AND date <= ?"
		expenseQuery += " AND date <= ?"
		argsIncome = append(argsIncome, endDate)
		argsExpense = append(argsExpense, endDate)
	}

	var totalIncome float64
	var totalExpense float64

	err = db.QueryRow(incomeQuery, argsIncome...).Scan(&totalIncome)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	err = db.QueryRow(expenseQuery, argsExpense...).Scan(&totalExpense)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	summary := Summary{
		TotalIncome:  totalIncome,
		TotalExpense: totalExpense,
		Balance:      totalIncome - totalExpense,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}
