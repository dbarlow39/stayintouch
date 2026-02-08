import { useState } from "react";
import AccountingDashboard from "./accounting/AccountingDashboard";
import AddClosingForm from "./accounting/AddClosingForm";
import EditClosingForm from "./accounting/EditClosingForm";
import CheckLogging from "./accounting/CheckLogging";
import CommissionPrep from "./accounting/CommissionPrep";
import TaxSummaryExport from "./accounting/TaxSummaryExport";
import AgentClosingsView from "./accounting/AgentClosingsView";
import AgentsPage from "./accounting/AgentsPage";
import VendorsPage from "./accounting/VendorsPage";

const AccountingTab = () => {
  const [view, setView] = useState("dashboard");
  const [editClosingId, setEditClosingId] = useState<string | null>(null);
  const [agentClosingsName, setAgentClosingsName] = useState<string | null>(null);

  const goToDashboard = () => {
    setView("dashboard");
    setEditClosingId(null);
    setAgentClosingsName(null);
  };

  const handleNavigate = (target: string) => {
    if (target.startsWith("edit-closing:")) {
      setEditClosingId(target.replace("edit-closing:", ""));
      setView("edit-closing");
    } else if (target.startsWith("agent-closings:")) {
      setAgentClosingsName(target.replace("agent-closings:", ""));
      setView("agent-closings");
    } else {
      setView(target);
    }
  };

  switch (view) {
    case "add-closing":
      return <AddClosingForm onBack={goToDashboard} />;
    case "edit-closing":
      return editClosingId ? <EditClosingForm closingId={editClosingId} onBack={goToDashboard} /> : null;
    case "check-logging":
      return <CheckLogging onBack={goToDashboard} />;
    case "commission-prep":
      return <CommissionPrep onBack={goToDashboard} />;
    case "1099-export":
      return <TaxSummaryExport onBack={goToDashboard} />;
    case "agents":
      return <AgentsPage onBack={goToDashboard} onNavigate={handleNavigate} />;
    case "vendors":
      return <VendorsPage onBack={goToDashboard} />;
    case "agent-closings":
      return agentClosingsName ? <AgentClosingsView agentName={agentClosingsName} onBack={() => handleNavigate("agents")} /> : null;
    default:
      return <AccountingDashboard onNavigate={handleNavigate} />;
  }
};

export default AccountingTab;
