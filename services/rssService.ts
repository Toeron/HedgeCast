import type { Article } from '../types';

// Using a CORS proxy to fetch the RSS feed from the browser.
// Switched to corsproxy.io as allorigins.win can be unreliable.
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

const getElementText = (element: Element, tagName: string): string => {
    const node = element.querySelector(tagName);
    // Use textContent to get text from nodes, and handle CDATA sections.
    return node?.textContent ?? '';
};


export const fetchArticles = async (rssUrl: string): Promise<Article[]> => {
  try {
    const response = await fetch(`${CORS_PROXY}${encodeURIComponent(rssUrl)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed. Status: ${response.status}`);
    }
    const xmlString = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');

    const errorNode = doc.querySelector('parsererror');
    if (errorNode) {
        throw new Error('Failed to parse RSS feed.');
    }
    
    const items = Array.from(doc.querySelectorAll('item'));
    
    return items.map(item => {
      const tempDiv = document.createElement('div');
      
      const descriptionHtml = getElementText(item, 'description');
      tempDiv.innerHTML = descriptionHtml;
      const description = tempDiv.textContent || tempDiv.innerText || "";
      
      const contentEncodedHtml = getElementText(item, 'content\\:encoded');
      const fullHtmlContent = contentEncodedHtml || descriptionHtml;
      tempDiv.innerHTML = fullHtmlContent;
      const content = tempDiv.textContent || tempDiv.innerText || "";
      
      const imageElement = tempDiv.querySelector('img');
      const imageUrl = imageElement ? imageElement.src : undefined;

      return {
        id: getElementText(item, 'guid'),
        title: getElementText(item, 'title'),
        link: getElementText(item, 'link'),
        description: description,
        pubDate: getElementText(item, 'pubDate'),
        content: content || description, // Fallback to description if content:encoded is not present
        contentHtml: fullHtmlContent,
        imageUrl: imageUrl,
      };
    });
  } catch (error) {
    console.error("Error fetching or parsing RSS feed:", error);
    throw new Error("Could not load articles from the source. The RSS feed might be unavailable or invalid.");
  }
};