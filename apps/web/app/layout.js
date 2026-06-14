import "./globals.css";
import CustomCursor from "../components/CustomCursor";

export const metadata = {
  title: "Let's Night",
  description: "Discoteche, feste universitarie, cene show e molto altro a Milano.",
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
