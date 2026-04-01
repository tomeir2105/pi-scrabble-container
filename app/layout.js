import "./globals.css";
import { Fraunces, Space_Grotesk } from "next/font/google";

const headingFont = Fraunces({
  subsets: ["latin"],
  variable: "--font-heading"
});

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata = {
  title: "סקרבלייב",
  description: "משחק מילים רב-משתתפים בזמן אמת."
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${headingFont.variable} ${bodyFont.variable}`}>{children}</body>
    </html>
  );
}
