import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Smartphone, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <Smartphone className="w-12 h-12 mx-auto mb-3 text-primary" />
          <CardTitle className="text-2xl">Install Stay in Touch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isInstalled ? (
            <div className="text-center space-y-3">
              <CheckCircle className="w-16 h-16 mx-auto text-primary" />
              <p className="text-lg font-medium">App is installed!</p>
              <p className="text-muted-foreground">You can now find Stay in Touch on your home screen.</p>
              <Button onClick={() => navigate("/dashboard")} className="w-full">
                Go to Dashboard
              </Button>
            </div>
          ) : isIOS ? (
            <div className="space-y-3">
              <p className="text-muted-foreground">To install on your iPhone or iPad:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Tap the <strong>Share</strong> button (square with arrow) in Safari</li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                <li>Tap <strong>"Add"</strong> to confirm</li>
              </ol>
            </div>
          ) : deferredPrompt ? (
            <div className="space-y-3">
              <p className="text-muted-foreground">
                Install Stay in Touch on your device for quick access, offline support, and a native app experience.
              </p>
              <Button onClick={handleInstall} className="w-full" size="lg">
                <Download className="w-4 h-4 mr-2" />
                Install App
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-muted-foreground">
                To install, open this page in your mobile browser and use the browser menu to "Add to Home Screen".
              </p>
            </div>
          )}
          <Button variant="ghost" onClick={() => navigate("/")} className="w-full">
            Continue in browser
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Install;
