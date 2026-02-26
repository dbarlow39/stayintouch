import { FileText } from "lucide-react";

const ResidentialWorkSheetTab = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-bold">Residential Work Sheet</h2>
      </div>
      <p className="text-muted-foreground">Manage your residential work sheets here.</p>
    </div>
  );
};

export default ResidentialWorkSheetTab;
