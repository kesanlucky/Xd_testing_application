package main

import (
	"log"
	"net/http"

	"xdtest/modules/dbtests"
	"xdtest/modules/monitor"
)

func main() {
	mux := http.NewServeMux()

	// CORS Middleware Helper
	corsHandler := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			next(w, r)
		}
	}

	// Register module routes
	dbtests.RegisterRoutes(mux, corsHandler)
	monitor.RegisterRoutes(mux, corsHandler)

	log.Println("XD Test backend server running on :8081")
	log.Fatal(http.ListenAndServe(":8081", mux))
}
