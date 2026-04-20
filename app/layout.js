import "./globals.css";

export const metadata = {
  title: "Let's Night - Cosa fai stasera?",
  description: "Discoteche, feste universitarie, cene show e molto altro a Milano e Roma. Prenota il tuo posto in pochi secondi.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
