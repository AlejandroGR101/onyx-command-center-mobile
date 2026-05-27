import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProvider } from "@/lib/userContext";
import { AuthProvider, useAuth } from "@/lib/authContext";
import { MobileNavProvider } from "@/lib/mobileNav";
import AppSidebar from "@/components/AppSidebar";
import TopBar from "@/components/TopBar";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Pipeline from "@/pages/pipeline";
import Production from "@/pages/production";
import Environment from "@/pages/environment";
import Finance from "@/pages/finance";
import Maintenance from "@/pages/maintenance";
import Inventory from "@/pages/inventory";
import Shipping from "@/pages/shipping";
import Leads from "@/pages/leads";
import Vendors from "@/pages/vendors";
import PressLog from "@/pages/press-log";
import LoginPage from "@/pages/login";

function AppRouter() {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      {/* Main content area — full width on mobile, offset on md+ for sidebar */}
      <div className="flex-1 md:ml-[240px] flex flex-col min-h-screen overflow-x-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/pipeline" component={Pipeline} />
            <Route path="/production" component={Production} />
            <Route path="/environment" component={Environment} />
            <Route path="/finance" component={Finance} />
            <Route path="/maintenance" component={Maintenance} />
            <Route path="/inventory" component={Inventory} />
            <Route path="/shipping" component={Shipping} />
            <Route path="/leads" component={Leads} />
            <Route path="/vendors" component={Vendors} />
            <Route path="/press-log" component={PressLog} />
            <Route component={NotFound} />
          </Switch>
        </main>
        <footer className="px-3 sm:px-6 py-3 border-t border-white/[0.06] flex items-center justify-between">
          <span className="text-[10px] text-white/20">Onyx Record Press — Arcadia, CA — Pheenix Alpha AD12</span>
          <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer" className="text-[10px] text-white/20 hover:text-white/40 transition-colors hidden sm:inline">
            Created with Perplexity Computer
          </a>
        </footer>
      </div>
    </div>
  );
}

function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white/40 text-xs tracking-widest uppercase">
        Cargando…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <UserProvider>
      <MobileNavProvider>
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </MobileNavProvider>
    </UserProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <AuthGate />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
