import datetime
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base


class Piece(Base):
    """Représente une pièce ou un lieu global (ex: Garage, Cuisine, Atelier)."""
    __tablename__ = "pieces"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nom = Column(String(120), nullable=False, unique=True, index=True)
    date_creation = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    emplacements = relationship("Emplacement", back_populates="piece", cascade="all, delete-orphan", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "nom": self.nom,
            "date_creation": self.date_creation.isoformat() if self.date_creation else None,
            "emplacements": [emp.to_dict() for emp in self.emplacements] if self.emplacements else []
        }


class Emplacement(Base):
    """Représente un sous-espace dans une pièce (ex: Étagère à côté de l'entrée, Îlot central, Tiroir haut)."""
    __tablename__ = "emplacements"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    piece_id = Column(Integer, ForeignKey("pieces.id", ondelete="CASCADE"), nullable=False, index=True)
    nom = Column(String(120), nullable=False, index=True)
    date_creation = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    piece = relationship("Piece", back_populates="emplacements")
    contenants = relationship("Contenant", back_populates="emplacement", cascade="all, delete-orphan", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "piece_id": self.piece_id,
            "piece_nom": self.piece.nom if self.piece else None,
            "nom": self.nom,
            "date_creation": self.date_creation.isoformat() if self.date_creation else None,
            "contenants": [cont.to_dict() for cont in self.contenants] if self.contenants else []
        }


class Contenant(Base):
    """Représente une boîte, caisse, bac ou meuble contenant des objets (ex: Caisse en carton Action 02, Boîte à vis)."""
    __tablename__ = "contenants"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    emplacement_id = Column(Integer, ForeignKey("emplacements.id", ondelete="CASCADE"), nullable=False, index=True)
    nom = Column(String(120), nullable=False, index=True)
    date_creation = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    emplacement = relationship("Emplacement", back_populates="contenants")
    objets = relationship("Objet", back_populates="contenant", cascade="all, delete-orphan", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "emplacement_id": self.emplacement_id,
            "emplacement_nom": self.emplacement.nom if self.emplacement else None,
            "piece_nom": self.emplacement.piece.nom if (self.emplacement and self.emplacement.piece) else None,
            "nom": self.nom,
            "date_creation": self.date_creation.isoformat() if self.date_creation else None,
            "objets": [obj.to_dict() for obj in self.objets] if self.objets else []
        }


class Objet(Base):
    """Représente un objet stocké (ex: Ruban de masquage, Tournevis cruciforme, Masque FFP2)."""
    __tablename__ = "objets"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    contenant_id = Column(Integer, ForeignKey("contenants.id", ondelete="CASCADE"), nullable=False, index=True)
    nom = Column(String(160), nullable=False, index=True)
    description = Column(Text, nullable=True)
    quantite = Column(Integer, default=1, nullable=False)
    date_creation = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    date_modification = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    contenant = relationship("Contenant", back_populates="objets")

    def to_dict(self):
        contenant_nom = self.contenant.nom if self.contenant else None
        emplacement_nom = self.contenant.emplacement.nom if (self.contenant and self.contenant.emplacement) else None
        piece_nom = (
            self.contenant.emplacement.piece.nom
            if (self.contenant and self.contenant.emplacement and self.contenant.emplacement.piece)
            else None
        )
        return {
            "id": self.id,
            "contenant_id": self.contenant_id,
            "nom": self.nom,
            "description": self.description or "",
            "quantite": self.quantite,
            "date_creation": self.date_creation.isoformat() if self.date_creation else None,
            "date_modification": self.date_modification.isoformat() if self.date_modification else None,
            "contenant_nom": contenant_nom,
            "emplacement_nom": emplacement_nom,
            "piece_nom": piece_nom,
            "chemin_complet": f"{piece_nom or '?'} > {emplacement_nom or '?'} > {contenant_nom or '?'}"
        }


class Configuration(Base):
    """Table clé/valeur pour les paramètres système."""
    __tablename__ = "configurations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cle = Column(String(80), unique=True, nullable=False, index=True)
    valeur = Column(Text, nullable=False)

    def to_dict(self):
        return {
            "cle": self.cle,
            "valeur": self.valeur
        }
