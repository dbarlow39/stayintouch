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
import BuyerLeadDetail from "./pages/BuyerLeadDetail";
import DailyCallSheet from "./pages/DailyCallSheet";
import AddLead from "./pages/AddLead";
import ClientDetail from "./pages/ClientDetail";
import LoveQuestionnaire from "./pages/LoveQuestionnaire";


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

const isLoveSubdomain = () => {
  const host = window.location.hostname;
  return host.startsWith('10thingsilove.');
};

const LoveLandingPlaceholder = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#f8fafc', fontFamily: 'Arial, sans-serif' }}>
    <div style={{ maxWidth: 520, textAlign: 'center', background: '#fff', padding: '40px 32px', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#047857', marginBottom: 12 }}>10 Things You Love About Your Home</h1>
      <p style={{ color: '#444', lineHeight: 1.6 }}>
        This page can only be opened from the personal link in the email your listing agent sent you. Please open that email and click the green "Share Your 10 Things" button.
      </p>
      <p style={{ color: '#888', fontSize: 13, marginTop: 24 }}>Sell For 1 Percent</p>
    </div>
  </div>
);

const IndexOrListings = () => {
  if (isLoveSubdomain()) return <LoveLandingPlaceholder />;
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
            <Route path="/buyer-lead/:id" element={<BuyerLeadDetail />} />
            <Route path="/daily-call-sheet" element={<DailyCallSheet />} />
            <Route path="/leads/new" element={<AddLead />} />
            <Route path="/clients/:id" element={<ClientDetail />} />
            <Route path="/love/:token" element={<LoveQuestionnaire />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
