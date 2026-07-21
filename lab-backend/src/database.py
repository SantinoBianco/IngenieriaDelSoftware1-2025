import os
from sqlalchemy import create_engine, inspect, text, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, Session
from sqlalchemy.orm.session import sessionmaker
from fastapi import Depends

#conexion con la base de datos
sqlite_file_name = "database.sqlite"
base_dir = os.path.dirname(os.path.realpath(__file__))
database_url = f"sqlite:///{os.path.join(base_dir, sqlite_file_name)}"

engine = create_engine(database_url, echo=True)

# Habilitar claves foráneas en SQLite para soportar ON DELETE CASCADE
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    except Exception:

        pass


Base = declarative_base()

session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_session():
    db = session()
    try:
        yield db
    finally:
        db.close()

def get_db():
    db = session()
    try:
        yield db
    finally:
        db.close()
        
# Función para crear todas las tablas
def create_tables():
    Base.metadata.create_all(bind=engine)

def reset_tables():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

def delete_database_file():
    """Elimina el archivo SQLite para recrear el esquema desde cero."""
    engine.dispose()
    db_path = os.path.join(base_dir, sqlite_file_name)
    if os.path.exists(db_path):
        os.remove(db_path)