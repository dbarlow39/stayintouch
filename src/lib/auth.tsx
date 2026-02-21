import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    let initialLoadDone = false;

    // Set up listener FIRST (required by Supabase docs)
    // but only allow it to update state AFTER initial load is done
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        if (!isMounted) return;
        // Skip INITIAL_SESSION events - we handle that via getSession
        if (!initialLoadDone) return;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
      }
    );

    // INITIAL load (controls loading)
    const initializeAuth = async () => {
      let foundSession = false;
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        console.log("[Auth] getSession result:", currentSession ? `user=${currentSession.user?.email}` : "NO SESSION");
        if (!isMounted) return;
        foundSession = !!currentSession;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
      } finally {
        if (isMounted) {
          initialLoadDone = true;
          setLoading(false);
          console.log("[Auth] loading set to false, user:", foundSession ? "exists" : "null");
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      toast.success("Welcome back!");
      navigate("/dashboard");
      return { error: null };
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in");
      return { error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const redirectUrl = `${window.location.origin}/dashboard`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
          },
        },
      });
      if (error) throw error;
      toast.success("Account created! Welcome to My Real Estate Office.");
      navigate("/dashboard");
      return { error: null };
    } catch (error: any) {
      toast.error(error.message || "Failed to create account");
      return { error };
    }
  };

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
      return { error: null };
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in with Google");
      return { error };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Signed out successfully");
      navigate("/auth");
    } catch (error: any) {
      toast.error("Failed to sign out");
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
