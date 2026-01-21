import { PropertyData, ClosingCostData } from "@/types/estimatedNet";
import { calculateClosingCosts, formatCurrency } from "@/utils/estimatedNetCalculations";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface ClosingCostsDisplayProps {
  propertyData: PropertyData;
  onClose: () => void;
}

const ClosingCostsDisplay = ({ propertyData, onClose }: ClosingCostsDisplayProps) => {
  const closingCosts = calculateClosingCosts(propertyData);

  const CostRow = ({ label, amount, isSubtotal = false, isTotal = false }: { 
    label: string; 
    amount: number; 
    isSubtotal?: boolean;
    isTotal?: boolean;
  }) => (
    <div className={`flex justify-between py-2 ${isTotal ? 'text-lg font-bold border-t-2 pt-3' : isSubtotal ? 'font-semibold' : ''}`}>
      <span className={isTotal ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
      <span className={isTotal ? (amount >= 0 ? 'text-green-600' : 'text-destructive') : ''}>{formatCurrency(amount)}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Property Info */}
      <div className="text-center pb-4 border-b">
        <h3 className="text-xl font-bold">{propertyData.name}</h3>
        <p className="text-muted-foreground">{propertyData.streetAddress}</p>
        <p className="text-muted-foreground">{propertyData.city}, {propertyData.state} {propertyData.zip}</p>
      </div>

      {/* Selling Price & Mortgages */}
      <div>
        <CostRow label="Selling Price" amount={closingCosts.sellingPrice} isSubtotal />
        <CostRow label="1st Mortgage Payoff" amount={closingCosts.firstMortgage} />
        <CostRow label="2nd Mortgage Payoff" amount={closingCosts.secondMortgage} />
        <CostRow label="Buyer Closing Cost" amount={closingCosts.buyerClosingCost} />
      </div>

      <Separator />

      {/* Tax Information */}
      <div>
        <h4 className="font-semibold mb-2">Tax Information</h4>
        <CostRow label="Taxes 1st Half" amount={closingCosts.taxesFirstHalf} />
        <CostRow label="Taxes 2nd Half" amount={closingCosts.taxesSecondHalf} />
        <CostRow label="Taxes Due This Year (Prorated)" amount={closingCosts.taxesDueForYear} />
      </div>

      <Separator />

      {/* Commissions & Fees */}
      <div>
        <h4 className="font-semibold mb-2">Commissions & Fees</h4>
        <CostRow label="Listing Agent Commission" amount={closingCosts.listingAgentCommission} />
        <CostRow label="Buyer Agent Commission" amount={closingCosts.buyerAgentCommission} />
        <CostRow label="County Conveyance Fee (0.4%)" amount={closingCosts.countyConveyanceFee} />
        <CostRow label="Home Warranty" amount={closingCosts.homeWarranty} />
      </div>

      <Separator />

      {/* Title & Closing Costs */}
      <div>
        <h4 className="font-semibold mb-2">Title & Closing Costs</h4>
        <CostRow label="Title Examination" amount={closingCosts.titleExamination} />
        <CostRow label="Title Settlement" amount={closingCosts.titleSettlement} />
        <CostRow label="Closing Fee" amount={closingCosts.closingFee} />
        <CostRow label="Deed Preparation" amount={closingCosts.deedPreparation} />
        <CostRow label="Overnight Fee" amount={closingCosts.overnightFee} />
        <CostRow label="Recording Fee" amount={closingCosts.recordingFee} />
        <CostRow label="Survey Coverage" amount={closingCosts.surveyCoverage} />
        <CostRow label="Admin Fee" amount={closingCosts.adminFee} />
        <CostRow label="Title Insurance" amount={closingCosts.titleInsurance} />
      </div>

      <Separator />

      {/* Estimated Net */}
      <CostRow label="ESTIMATED NET TO SELLER" amount={closingCosts.estimatedNet} isTotal />

      <div className="flex justify-end pt-4">
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
};

export default ClosingCostsDisplay;
