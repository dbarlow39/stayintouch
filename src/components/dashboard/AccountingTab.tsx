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
import VendorCheckPage from "./accounting/VendorCheckPage";
import ClosedDealsPage from "./accounting/ClosedDealsPage";

const AccountingTab = () => {
  const [view, setView] = useState("dashboard");
  const [editClosingId, setEditClosingId] = useState<string | null>(null);
  const [agentClosingsName, setAgentClosingsName] = useState<string | null>(null);
  const [vendorCheckData, setVendorCheckData] = useState<{ id: string; name: string; address: string; attention: string; csz: string } | null>(null);

  const goToDashboard = () => {
    setView("dashboard");
    setEditClosingId(null);
    setAgentClosingsName(null);
    setVendorCheckData(null);
  };

  const handleNavigate = (target: string) => {
    if (target.startsWith("edit-closing:")) {
      setEditClosingId(target.replace("edit-closing:", ""));
      setView("edit-closing");
    } else if (target.startsWith("agent-closings:")) {
      setAgentClosingsName(target.replace("agent-closings:", ""));
      setView("agent-closings");
    } else if (target.startsWith("vendor-check:")) {
      const parts = target.replace("vendor-check:", "").split(":");
      setVendorCheckData({ id: parts[0], name: parts[1], address: parts[2] || "", attention: parts[3] || "", csz: parts[4] || "" });
      setView("vendor-check");
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
      return <VendorsPage onBack={goToDashboard} onNavigate={handleNavigate} />;
    case "vendor-check":
      return vendorCheckData ? (
        <VendorCheckPage
          vendorId={vendorCheckData.id}
          vendorName={vendorCheckData.name}
          vendorAddress={vendorCheckData.address}
          vendorAttention={vendorCheckData.attention}
          vendorCityStateZip={vendorCheckData.csz}
          onBack={() => handleNavigate("vendors")}
        />
      ) : null;
    case "agent-closings":
      return agentClosingsName ? <AgentClosingsView agentName={agentClosingsName} onBack={() => handleNavigate("agents")} /> : null;
    case "closed-deals":
      return <ClosedDealsPage onBack={goToDashboard} onNavigate={handleNavigate} />;
    default:
      return <AccountingDashboard onNavigate={handleNavigate} />;
  }
};

export default AccountingTab;
