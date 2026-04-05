import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: 'PRISM Intelligence — AI-Powered Financial Analyst',
  description: 'The world\'s highest-performing platform for financial research, powered by RAG and multi-tier LLM generation.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://cdn.plot.ly/plotly-2.35.0.min.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
