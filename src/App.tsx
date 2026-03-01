import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Account from "./pages/Account";
import Install from "./pages/Install";
import ListingDetail from "./pages/ListingDetail";
import PublicListings from "./pages/PublicListings";
import NotFound from "./pages/NotFound";
import AdResults from "./pages/AdResults";
import SellerLeadDetail from "./pages/SellerLeadDetail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,       // Data is fresh for 30 seconds
      gcTime: 1000 * 60 * 5,      // Garbage collect after 5 minutes
      refetchOnWindowFocus: true,  // Always refetch when user returns to tab
      retry: 1,
    },
  },
});

const isListingsSubdomain = () => {
  const host = window.location.hostname;
  return host.startsWith('listings.');
};

const IndexOrListings = () => {
  return isListingsSubdomain() ? <PublicListings /> : <Index />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<IndexOrListings />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/account" element={<Account />} />
            <Route path="/install" element={<Install />} />
            <Route path="/listings" element={<PublicListings />} />
            <Route path="/listing/:id" element={<ListingDetail />} />
            <Route path="/ad-results/:postId" element={<AdResults />} />
            <Route path="/seller-lead/:id" element={<SellerLeadDetail />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
