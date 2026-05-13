import "./globals.css";
import CustomCursor from "../components/CustomCursor";

export const metadata = {
  title: "Let's Night — Cosa fai stasera?",
  description: "Discoteche, feste universitarie, cene show e molto altro a Milano e Roma.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>
        <CustomCursor />
        {children}
      </body>
    </html>
  );
}
