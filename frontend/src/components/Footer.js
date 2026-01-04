import React from 'react';

const Footer = () => {
  return (
    <footer className="mt-12 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-6 ml-16">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-600 dark:text-slate-400">
        <div>
          <strong className="text-slate-900 dark:text-white">TrafficWatch</strong>
          <span className="ml-2">• AI-driven traffic enforcement platform</span>
        </div>
        <div className="flex items-center gap-4">
          <button type="button" className="hover:underline">Privacy</button>
          <button type="button" className="hover:underline">Terms</button>
          <button type="button" className="hover:underline">Help</button>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-500">© {new Date().getFullYear()} TrafficWatch • v1.0</div>
      </div>
    </footer>
  );
};

export default Footer;
