import urllib.request
import urllib.parse
import re
import logging
import datetime
import html as html_lib

logger = logging.getLogger(__name__)

def parse_ddg_results(html: str) -> list[dict]:
    matches = re.finditer(
        r"<h2 class=\"result__title\">.*?<a[^>]*class=\"result__a\"[^>]*href=\"(?P<href>[^\"]+)\"[^>]*>(?P<title>.*?)</a>.*?<a class=\"result__snippet\"[^>]*>(?P<snippet>.*?)</a>",
        html,
        re.DOTALL
    )
    results = []
    for m in matches:
        href = m.group("href")
        title = m.group("title")
        snippet = m.group("snippet")
        
        # Clean HTML tags and decode HTML entities
        title = re.sub(r"<[^>]+>", "", title).strip()
        title = html_lib.unescape(title)
        
        snippet = re.sub(r"<[^>]+>", "", snippet).strip()
        snippet = html_lib.unescape(snippet)
        
        parsed = urllib.parse.urlparse(href)
        qs = urllib.parse.parse_qs(parsed.query)
        url = qs.get("uddg", [None])[0]
        if not url:
            url = href
            if url.startswith("//"):
                url = "https:" + url
                
        results.append({
            "url": url,
            "title": title,
            "snippet": snippet
        })
    return results

def build_search_query(query: str) -> str:
    current_terms = (
        "current",
        "latest",
        "today",
        "now",
        "present",
        "prime minister",
        "pm",
        "president",
        "ceo",
    )
    query_lower = query.lower()
    if any(term in query_lower for term in current_terms):
        today = datetime.date.today().isoformat()
        return f"{query} current as of {today}"
    return query

async def search_web(query: str, max_results: int = 5) -> str:
    """
    Search DuckDuckGo and return a formatted text context of the search results.
    """
    logger.info(f"Performing web search for: {query}")
    try:
        # Use a standard Chrome User-Agent to avoid getting blocked
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        search_query = build_search_query(query)
        params = urllib.parse.urlencode({
            "q": search_query,
            "df": "y",
        })
        url = f"https://html.duckduckgo.com/html/?{params}"
        
        # Run synchronous urlopen in a thread pool to avoid blocking the async loop
        import asyncio
        from concurrent.futures import ThreadPoolExecutor
        
        def fetch():
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.read().decode("utf-8")
                
        loop = asyncio.get_running_loop()
        with ThreadPoolExecutor() as pool:
            html = await loop.run_in_executor(pool, fetch)
            
        results = parse_ddg_results(html)
        if not results:
            return ""
            
        formatted_results = []
        for i, r in enumerate(results[:max_results], 1):
            formatted_results.append(
                f"[{i}] Title: {r['title']}\nURL: {r['url']}\nSnippet: {r['snippet']}"
            )
            
        return "\n\n".join(formatted_results)
    except Exception as e:
        logger.error(f"Web search failed: {e}")
        return ""
