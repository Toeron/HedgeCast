import React from 'react';
import type { Article } from '../types';

interface ArticleListProps {
  articles: Article[];
  selectedArticleId: string | null;
  processingArticleId: string | null;
  favoriteArticleIds: Set<string>;
  onSelectArticle: (article: Article) => void;
}

const ArticleList: React.FC<ArticleListProps> = ({ articles, selectedArticleId, processingArticleId, favoriteArticleIds, onSelectArticle }) => {
  return (
    <ul className="divide-y divide-slate-700">
    {articles.map(article => {
        const isSelected = article.id === selectedArticleId;
        const isProcessing = article.id === processingArticleId;
        const isFavorited = favoriteArticleIds.has(article.id);
        return (
        <li key={article.id}>
            <button
            onClick={() => onSelectArticle(article)}
            disabled={isProcessing}
            className={`w-full text-left p-4 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                isSelected ? 'bg-sky-900/50' : 'hover:bg-slate-700/50'
            } ${isProcessing ? 'cursor-not-allowed opacity-50' : ''}`}
            >
            <div className="flex items-start gap-4">
                {article.imageUrl && (
                    <img 
                        src={article.imageUrl} 
                        alt={article.title}
                        className="w-24 h-24 object-cover rounded-md flex-shrink-0 bg-slate-700" 
                        loading="lazy"
                    />
                )}
                <div className="flex-grow">
                    <h3 className={`font-semibold ${isSelected ? 'text-sky-300' : 'text-slate-100'}`}>
                        {article.title}
                    </h3>
                    <div className="flex items-center gap-2">
                        <p className="text-xs text-slate-400 mt-1">
                            {new Date(article.pubDate).toLocaleString()}
                        </p>
                        {isFavorited && (
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-amber-400 mt-1" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                        )}
                    </div>
                    <p className="text-sm text-slate-300 mt-2 line-clamp-3">
                        {article.description}
                    </p>
                    {isProcessing && (
                        <div className="flex items-center gap-2 mt-2 text-xs text-sky-400">
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>Generating...</span>
                        </div>
                    )}
                </div>
            </div>
            </button>
        </li>
        );
    })}
    </ul>
  );
};

export default ArticleList;
