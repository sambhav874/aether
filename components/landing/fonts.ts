import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

export const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-landing-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-landing-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});
