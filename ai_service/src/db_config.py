from sqlalchemy import create_engine

DB_URL = "postgresql://postgres:admin@localhost:5432/vatto"

def get_engine():
    return create_engine(DB_URL)
