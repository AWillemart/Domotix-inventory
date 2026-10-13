import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

# Chemin par défaut : volume Docker /data ou dossier local ./data
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/inventory.db")

# Assurer que le répertoire parent existe
if DATABASE_URL.startswith("sqlite:///"):
    db_path = DATABASE_URL.replace("sqlite:///", "")
    dir_path = os.path.dirname(db_path)
    if dir_path:
        os.makedirs(dir_path, exist_ok=True)

# Configuration du moteur SQLite avec connect_args pour le multithreading
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    echo=False
)

# Activer le support des clés étrangères et le mode WAL pour SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if "sqlite" in DATABASE_URL:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dépendance FastAPI pour obtenir une session de base de données."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialise les tables et injecte les paramètres par défaut."""
    from models import Configuration
    Base.metadata.create_all(bind=engine)
    
    # Paramètres par défaut
    defaults = {
        "ollama_url": os.getenv("OLLAMA_URL", "http://ollama:11434"),
        "whisper_url": os.getenv("WHISPER_URL", "http://faster-whisper:9000"),
        "piper_url": os.getenv("PIPER_URL", "http://piper:5000"),
        "ollama_model": os.getenv("DEFAULT_OLLAMA_MODEL", "gemma3:4b"),
        "require_validation": "true",  # "true" ou "false"
    }

    db = SessionLocal()
    try:
        for cle, valeur in defaults.items():
            existing = db.query(Configuration).filter(Configuration.cle == cle).first()
            if not existing:
                db.add(Configuration(cle=cle, valeur=valeur))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Erreur lors de l'initialisation des paramètres : {e}")
    finally:
        db.close()
