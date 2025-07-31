// "use client";

// import React from "react";
// import { BadgeProvider } from "../context/BadgeProvider";
// import { SearchProvider } from "../context/SearchProvider";
// import MarketHeader from "./components/market_screen/MarketHeader";

// interface MainLayoutProps {
//   children: React.ReactNode;
//   headerBackground?: string;
//   useWhiteColors?: boolean;
//   isDefaultView?: boolean;
//   showHeader?: boolean;
// }

// export default function MainLayout({
//   children,
//   headerBackground = "#ffffff",
//   useWhiteColors = false,
//   isDefaultView = true,
//   showHeader = true,
// }: MainLayoutProps) {
//   return (
//     <BadgeProvider>
//       <SearchProvider>
//         <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
//           {showHeader && (
//             <MarketHeader
//               backgroundColorNotifier={headerBackground}
//               useWhiteColors={useWhiteColors}
//               isDefaultView={isDefaultView}
//               onTakePhoto={() => console.log("Take photo")}
//               onSelectFromAlbum={() => console.log("Select from album")}
//             />
//           )}
//           <main className="relative">{children}</main>
//         </div>
//       </SearchProvider>
//     </BadgeProvider>
//   );
// }
