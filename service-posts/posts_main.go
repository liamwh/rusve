package main

import (
	"database/sql"
	"fmt"
	"log"
	"net"

	"github.com/go-playground/validator/v10"
	_ "github.com/jackc/pgx/v5/stdlib"
	migrate "github.com/rubenv/sql-migrate"
	"google.golang.org/grpc"

	pb "rusve/proto"

	utils "github.com/mpiorowski/golang"
)

var db *sql.DB

type server struct {
	pb.UnsafePostsServiceServer
}

var (
	PORT         = utils.MustGetenv("PORT")
	ENV          = utils.MustGetenv("ENV")
	DATABASE_URL = utils.MustGetenv("DATABASE_URL")
)

var validate = validator.New()

func init() {
	// Db connection
	var err error

	if db, err = sql.Open("pgx", DATABASE_URL); err != nil {
		log.Fatal(err)
	}
	pingErr := db.Ping()
	if pingErr != nil {
		log.Fatal(pingErr)
	}
	log.Println("Connected to database")

	// Migrations
	var migrationsDir = "./migrations"
	if ENV == "production" {
		migrationsDir = "/migrations"
	}
	migrations := &migrate.FileMigrationSource{
		Dir: migrationsDir,
	}
	n, err := migrate.Exec(db, "postgres", migrations, migrate.Up)
	if err != nil {
		log.Fatalf("Migrations failed: %v", err)
	}
	log.Printf("Applied migrations: %d", n)
}

func main() {

	lis, err := net.Listen("tcp", fmt.Sprintf(":%v", PORT))
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}
	// this is not catching the requests
	s := grpc.NewServer()
	pb.RegisterPostsServiceServer(s, &server{})
	log.Printf("Server listening at: %v", lis.Addr())
	if err := s.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}
