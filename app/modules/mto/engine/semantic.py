import os
import numpy as np

MODEL_NAME = "minishlab/potion-multilingual-128M"
_MODEL = None


def get_model():
    """Charge (paresseusement) le modele d'embeddings local. 100% offline apres
    le 1er telechargement ; aucune donnee n'est envoyee a un service externe."""
    global _MODEL
    if _MODEL is None:
        from model2vec import StaticModel
        from app.modules.mto.engine import paths
        local = paths.model_path()  # modele embarque (exe) sinon HuggingFace (dev)
        _MODEL = StaticModel.from_pretrained(local or MODEL_NAME)
    return _MODEL


def encode(texts):
    """Encode des textes en vecteurs L2-normalises (le cosinus devient un produit scalaire)."""
    v = np.asarray(get_model().encode([str(t) for t in texts]), dtype=np.float32)
    norm = np.linalg.norm(v, axis=1, keepdims=True)
    norm[norm == 0] = 1.0
    return v / norm


def _catalogue_texts(df):
    """Texte encode par article : designation + texte de commande + fabricant + reference.
    Plus le texte est riche, mieux le semantique discrimine (et retrouve par reference)."""
    cols = [c for c in ("designation", "designation_long", "fabricant", "ref_fabricant") if c in df.columns]
    if not cols:
        return [""] * len(df)
    out = df[cols[0]].fillna("").astype(str)
    for c in cols[1:]:
        out = out.str.cat(df[c].fillna("").astype(str), sep=" ")
    return out.str.replace(r"\s+", " ", regex=True).str.strip().tolist()


def build_vectors(df):
    """Encode le catalogue. Retourne (articles: list[str], vectors: ndarray normalise)."""
    articles = df["article"].astype(str).tolist()
    return articles, encode(_catalogue_texts(df))


def save_vectors(path, articles, vectors):
    np.savez_compressed(path, articles=np.array(articles, dtype=object), vectors=vectors)


def load_vectors(path):
    if not os.path.exists(path):
        return None, None
    d = np.load(path, allow_pickle=True)
    return list(d["articles"]), d["vectors"]


def topk(query_text, vectors, k=20):
    """Indices (et score cosinus) des k articles les plus proches semantiquement."""
    if vectors is None or not len(vectors):
        return []
    q = encode([query_text])[0]
    sims = vectors @ q
    k = min(k, len(sims))
    idx = np.argpartition(-sims, k - 1)[:k]
    return [(int(i), float(sims[i])) for i in idx[np.argsort(-sims[idx])]]


class SemanticIndex:
    """Vecteurs du catalogue pour la recherche et le scoring semantiques."""

    def __init__(self, articles, vectors):
        self.articles = list(articles)
        self.vectors = vectors
        self._pos = {a: i for i, a in enumerate(self.articles)}

    @classmethod
    def load(cls, path):
        arts, vecs = load_vectors(path)
        return cls(arts, vecs) if arts is not None else None

    def search(self, text, k=20):
        """Liste (article, cosinus) des k plus proches d'une description."""
        return [(self.articles[i], c) for i, c in topk(text, self.vectors, k)]

    def query_vec(self, text):
        """Vecteur normalise d'une requete (a encoder une seule fois par ligne MTO)."""
        return encode([text])[0]

    def cos_to(self, qvec, article):
        """Cosinus entre un vecteur requete et l'article donne (0 si inconnu)."""
        i = self._pos.get(str(article))
        return float(self.vectors[i] @ qvec) if i is not None else 0.0
