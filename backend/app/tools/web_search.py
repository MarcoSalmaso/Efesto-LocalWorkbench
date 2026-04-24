import httpx
from bs4 import BeautifulSoup
from typing import Any, Dict
from .base import BaseTool

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; Efesto/1.0)",
    "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
}

class WebSearchTool(BaseTool):
    @property
    def name(self) -> str:
        return "web_search"

    @property
    def description(self) -> str:
        return (
            "Cerca informazioni aggiornate su internet tramite DuckDuckGo. "
            "Usa questo tool quando l'utente chiede notizie recenti, fatti che potrebbero "
            "essere cambiati dopo il tuo addestramento, prezzi, eventi, meteo o qualsiasi "
            "informazione che richiede dati in tempo reale."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "La query di ricerca da inviare a DuckDuckGo."
                },
                "max_results": {
                    "type": "integer",
                    "description": "Numero massimo di risultati da restituire (default: 5, max: 10).",
                    "default": 5,
                }
            },
            "required": ["query"]
        }

    async def execute(self, query: str, max_results: int = 5) -> str:
        max_results = min(max_results, 10)
        try:
            results = await self._ddg_search(query, max_results)
            if not results:
                return f"Nessun risultato trovato per: {query}"
            lines = [f"Risultati di ricerca per: {query}\n"]
            for i, r in enumerate(results, 1):
                lines.append(f"{i}. **{r['title']}**")
                lines.append(f"   {r['url']}")
                if r.get("snippet"):
                    lines.append(f"   {r['snippet']}")
                lines.append("")
            return "\n".join(lines)
        except Exception as e:
            return f"Errore durante la ricerca: {str(e)}"

    async def _ddg_search(self, query: str, max_results: int) -> list:
        url = "https://html.duckduckgo.com/html/"
        async with httpx.AsyncClient(headers=_HEADERS, follow_redirects=True, timeout=10) as client:
            resp = await client.post(url, data={"q": query, "kl": "it-it"})
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")
        results = []
        for result in soup.select(".result"):
            title_el = result.select_one(".result__title a")
            snippet_el = result.select_one(".result__snippet")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            href = title_el.get("href", "")
            # DuckDuckGo wraps URLs — estrai l'URL reale dal parametro uddg
            if "uddg=" in href:
                from urllib.parse import parse_qs, urlparse
                parsed = parse_qs(urlparse(href).query)
                href = parsed.get("uddg", [href])[0]
            snippet = snippet_el.get_text(strip=True) if snippet_el else ""
            results.append({"title": title, "url": href, "snippet": snippet})
            if len(results) >= max_results:
                break
        return results
