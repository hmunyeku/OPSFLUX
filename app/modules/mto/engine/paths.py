"""Chemins de l'application, compatibles execution normale ET packagee (PyInstaller).

- Donnees persistantes (base, vecteurs) : dossier `data/` A COTE de l'exe (ou racine projet
  en dev). Survit aux relancements ; l'app est livree sans donnees, elles s'y creent.
- Ressources bundlees (modele semantique) : dans le bundle PyInstaller (`sys._MEIPASS`),
  sous-dossier `models/`. En dev, on retombe sur le cache HuggingFace (None -> telechargement).
"""
import os
import sys

MODEL_DIRNAME = "potion-multilingual-128M"


def _is_frozen():
    return getattr(sys, "frozen", False)


def _base_dir():
    """Dossier de l'application : a cote de l'exe si packagee, sinon racine du projet."""
    if _is_frozen():
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _bundle_dir():
    """Dossier des ressources embarquees : _MEIPASS (PyInstaller) sinon racine projet."""
    if _is_frozen():
        return getattr(sys, "_MEIPASS", _base_dir())
    return _base_dir()


def data_dir():
    """Dossier des donnees persistantes (base + vecteurs).
    Packagee : sous-dossier `data/` a cote de l'exe (cree au besoin).
    Dev : racine du projet (conserve le stockfinder.db existant)."""
    if not _is_frozen():
        return _base_dir()
    d = os.path.join(_base_dir(), "data")
    os.makedirs(d, exist_ok=True)
    return d


def db_path():
    return os.path.join(data_dir(), "stockfinder.db")


def vectors_path():
    return os.path.join(data_dir(), "stockfinder_vectors.npz")


def model_path():
    """Chemin du modele semantique embarque (dossier local) ou None si absent
    (-> model2vec telecharge depuis HuggingFace, mode developpement)."""
    p = os.path.join(_bundle_dir(), "models", MODEL_DIRNAME)
    return p if os.path.isdir(p) else None
