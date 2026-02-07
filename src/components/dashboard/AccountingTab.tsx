import { useState } from "react";
import AccountingDashboard from "./accounting/AccountingDashboard";
import AddClosingForm from "./accounting/AddClosingForm";
import CheckLogging from "./accounting/CheckLogging";
import CommissionPrep from "./accounting/CommissionPrep";
import TaxSummaryExport from "./accounting/TaxSummaryExport";

const AccountingTab = () => {
  const [view, setView] = useState("dashboard");

  const goToDashboard = () => setView("dashboard");

  switch (view) {
    case "add-closing":
      return <AddClosingForm onBack={goToDashboard} />;
    case "check-logging":
      return <CheckLogging onBack={goToDashboard} />;
    case "commission-prep":
      return <CommissionPrep onBack={goToDashboard} />;
    case "1099-export":
      return <TaxSummaryExport onBack={goToDashboard} />;
    default:
      return <AccountingDashboard onNavigate={setView} />;
  }
};

export default AccountingTab;
