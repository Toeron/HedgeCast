import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-slate-800/50 backdrop-blur-sm p-4 border-b border-slate-700">
      <div className="container mx-auto flex items-center gap-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12.5a10.5 10.5 0 1 1 10.5 10.5" />
          <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z" />
          <path d="M18 18a7.5 7.5 0 0 0-12 0" />
        </svg>
        <div>
          <h1 className="text-2xl font-bold text-white">HedgeCast</h1>
          <p className="text-sm text-slate-400">Your AI-Powered News Audio Digest</p>
        </div>
      </div>
    </header>
  );
};

export default Header;