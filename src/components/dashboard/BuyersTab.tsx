import { Users } from "lucide-react";

const BuyersTab = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-bold">Buyers</h2>
      </div>
      <p className="text-muted-foreground">Manage your buyer clients here.</p>
    </div>
  );
};

export default BuyersTab;
