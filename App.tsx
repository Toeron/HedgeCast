import React, { useState, useEffect, useCallback } from 'react';
import type { Article } from './types';
import { fetchArticles } from './services/rssService';
import { summarizeText, generateSpeech } from './services/geminiService';
import Header from './components/Header';
import ArticleList from './components/ArticleList';
import AudioPlayer from './components/AudioPlayer';
import Loader from './components/Loader';
import ErrorDisplay from './components/ErrorDisplay';
import ScrollToTopButton from './components/ScrollToTopButton';

const RSS_FEED_URL = 'https://cms.zerohedge.com/fullrss2.xml';

interface Favorite {
  article: Article;
  audioData: string;
}

const ArticleDetail: React.FC<{
  article: Article;
  onGenerate: (article: Article) => void;
  isGenerating: boolean;
  hasAudio: boolean;
}> = ({ article, onGenerate, isGenerating, hasAudio }) => (
  <div className="bg-slate-800/30 rounded-lg p-6 relative h-full">
    <div className="h-full overflow-y-auto pr-2">
      <h2 className="text-3xl font-bold text-white mb-2">{article.title}</h2>
      <p className="text-sm text-slate-400 mb-4">
        {new Date(article.pubDate).toLocaleString()} &middot; <a href={article.link} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">Read Original</a>
      </p>

      {!hasAudio && (
        <button
          onClick={() => onGenerate(article)}
          disabled={isGenerating}
          className="mb-6 inline-flex items-center gap-2 px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 focus:ring-offset-slate-900 disabled:bg-slate-500 disabled:cursor-not-allowed transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path></svg>
          <span>Generate Audio Summary</span>
        </button>
      )}

      <div
        className="article-content"
        dangerouslySetInnerHTML={{ __html: article.contentHtml }}
      />
    </div>
  </div>
);

const App: React.FC = () => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [audioData, setAudioData] = useState<string | null>(null);
  
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationStatus, setGenerationStatus] = useState<string>('');
  const [processingArticleId, setProcessingArticleId] = useState<string | null>(null);

  const [favorites, setFavorites] = useState<Map<string, Favorite>>(() => {
    try {
      const savedFavorites = localStorage.getItem('favoriteArticles');
      if (savedFavorites) {
        const parsed = JSON.parse(savedFavorites) as [string, Favorite][];
        return new Map(parsed);
      }
      return new Map();
    } catch (error) {
      console.error("Failed to parse favorites from localStorage", error);
      return new Map();
    }
  });

  const [view, setView] = useState<'latest' | 'favorites'>('latest');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const favoritesArray = Array.from(favorites.entries());
      localStorage.setItem('favoriteArticles', JSON.stringify(favoritesArray));
    } catch (error) {
      console.error("Failed to save favorites to localStorage", error);
    }
  }, [favorites]);


  useEffect(() => {
    const loadArticles = async () => {
      try {
        setError(null);
        setIsLoadingFeed(true);
        const fetchedArticles = await fetchArticles(RSS_FEED_URL);
        setArticles(fetchedArticles);
      } catch (e: unknown) {
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError('An unknown error occurred while fetching articles.');
        }
      } finally {
        setIsLoadingFeed(false);
      }
    };
    loadArticles();
  }, []);

  const handleToggleFavorite = useCallback((article: Article, audioData: string | null) => {
    setFavorites(prevFavorites => {
      const newFavorites = new Map(prevFavorites);
      if (newFavorites.has(article.id)) {
        newFavorites.delete(article.id);
      } else if (audioData) {
        newFavorites.set(article.id, { article, audioData });
      }
      return newFavorites;
    });
  }, []);
  
  const handleSelectArticle = useCallback((article: Article) => {
    if (processingArticleId === article.id) return;

    setSelectedArticle(article);
    setAudioData(null);
    setError(null);
    
    if (favorites.has(article.id)) {
        setAudioData(favorites.get(article.id)!.audioData);
    }

    // On mobile, scroll to the reading pane
    if (window.innerWidth < 768) { // Tailwind's 'md' breakpoint
      setTimeout(() => {
        const readingPane = document.getElementById('reading-pane');
        readingPane?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100); // Timeout to allow the DOM to update
    }
  }, [processingArticleId, favorites]);

  const handleGenerateAudio = useCallback(async (article: Article) => {
    if (isGenerating) return;

    setAudioData(null);
    setError(null);
    setIsGenerating(true);
    setProcessingArticleId(article.id);

    try {
      setGenerationStatus('Samenvatting maken...');
      const summary = await summarizeText(article.content);
      
      setGenerationStatus('Audio genereren...');
      const speechData = await generateSpeech(summary);
      
      setAudioData(speechData);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError('An unknown error occurred during audio generation.');
      }
      // Clear selection on error so user can re-select and try again
      setSelectedArticle(null);
    } finally {
      setIsGenerating(false);
      setGenerationStatus('');
      setProcessingArticleId(null);
    }
  }, [isGenerating]);
  
  const WelcomeMessage: React.FC = () => (
    <div className="flex flex-col items-center justify-center h-full text-center bg-slate-800/50 rounded-lg border border-slate-700 p-8">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h7.5m3-15l-3-3m0 0l-3 3m3-3v12.75a3 3 0 01-3 3H6.75a3 3 0 01-3-3V6.75a3 3 0 013-3h9a3 3 0 013 3z" />
        </svg>
        <h2 className="text-2xl font-bold text-white">Welkom bij HedgeCast</h2>
        <p className="text-slate-400 mt-2">Selecteer een artikel uit de lijst om een audio-samenvatting te genereren.</p>
    </div>
  );

  const articlesToShow = view === 'latest' 
    ? articles 
    : Array.from(favorites.values())
        .map((f: Favorite) => f.article)
        .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col">
      <Header />
      <ScrollToTopButton />

      {(isGenerating || (audioData && selectedArticle)) && (
        <div className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur-sm shadow-lg border-b border-slate-700">
            <div className="container mx-auto p-4">
                {isGenerating && <Loader message={generationStatus} />}
                {error && !isGenerating && <ErrorDisplay message={error} />}
                {audioData && !isGenerating && selectedArticle && (
                    <AudioPlayer 
                      audioData={audioData} 
                      article={selectedArticle}
                      isFavorited={favorites.has(selectedArticle.id)}
                      onToggleFavorite={handleToggleFavorite}
                    />
                )}
            </div>
        </div>
      )}

      <main className="container mx-auto p-4 md:p-8 flex-grow">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 h-full">
            <div className="md:col-span-1 h-full flex flex-col">
                {isLoadingFeed ? (
                  <Loader message="Nieuwste artikelen ophalen..." />
                ) : (
                  <div className="bg-slate-800/50 rounded-lg border border-slate-700 h-full flex flex-col">
                    <div className="p-2 flex border-b border-slate-700 flex-shrink-0">
                      <button 
                        onClick={() => setView('latest')}
                        className={`flex-1 p-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${view === 'latest' ? 'bg-sky-800 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
                      >
                        Latest Articles
                      </button>
                      <button 
                        onClick={() => setView('favorites')}
                        className={`flex-1 p-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${view === 'favorites' ? 'bg-sky-800 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
                      >
                        Favorites ({favorites.size})
                      </button>
                    </div>

                    {error && articles.length === 0 && view === 'latest' && (
                        <div className="p-4">
                            <ErrorDisplay message={error} />
                        </div>
                    )}
                    
                    <div className="overflow-y-auto flex-grow">
                      {articlesToShow.length > 0 ? (
                        <ArticleList 
                            articles={articlesToShow} 
                            selectedArticleId={selectedArticle?.id || null} 
                            processingArticleId={processingArticleId}
                            favoriteArticleIds={new Set(favorites.keys())}
                            onSelectArticle={handleSelectArticle} 
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full p-4 text-center text-slate-400">
                           <p>You have no favorite articles yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
            </div>
            <div id="reading-pane" className="md:col-span-2 h-full">
                {!selectedArticle ? (
                    <WelcomeMessage />
                ) : (
                   <ArticleDetail
                      article={selectedArticle}
                      onGenerate={handleGenerateAudio}
                      isGenerating={processingArticleId === selectedArticle.id}
                      hasAudio={!!audioData}
                   />
                )}
            </div>
        </div>
      </main>
    </div>
  );
};

export default App;