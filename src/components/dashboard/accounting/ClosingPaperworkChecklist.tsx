import { Fragment } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle } from "lucide-react";

export type ChecklistKey =
  | "consumer_guide"
  | "agency_disclosure"
  | "signed_contract"
  | "representation_agreement"
  | "residential_property_disclosure"
  | "lead_based_paint_disclosure"
  | "affiliated_business_arrangement"
  | "home_inspection"
  | "settlement_statement";

export type ChecklistState = Partial<Record<ChecklistKey, boolean>>;

interface Props {
  representation: "seller" | "buyer" | null;
  builtBefore1978: boolean;
  onBuiltBefore1978Change: (v: boolean) => void;
  checklist: ChecklistState;
  onChange: (next: ChecklistState) => void;
}

interface Item {
  key: ChecklistKey;
  label: string;
  hint?: string;
}

const ClosingPaperworkChecklist = ({
  representation,
  builtBefore1978,
  onBuiltBefore1978Change,
  checklist,
  onChange,
}: Props) => {
  const items: Item[] = [
    { key: "settlement_statement", label: "Settlement Statement" },
    { key: "consumer_guide", label: "Consumer Guide" },
    { key: "agency_disclosure", label: "Agency Disclosure" },
    { key: "signed_contract", label: "Signed and Dated Contract" },
    {
      key: "representation_agreement",
      label:
        representation === "buyer"
          ? "Buyer Representation Agreement"
          : representation === "seller"
          ? "Exclusive Right to Sell"
          : "Exclusive Right to Sell or Buyer Representation Agreement",
    },
    {
      key: "residential_property_disclosure",
      label: "Residential Property Disclosure",
      hint: "At least one box checked in each section.",
    },
  ];

  if (builtBefore1978) {
    items.push({
      key: "lead_based_paint_disclosure",
      label: "Lead Paint Disclosure",
      hint: "Required for homes built prior to 1978.",
    });
  }

  if (representation === "seller") {
    items.push({
      key: "affiliated_business_arrangement",
      label: "Affiliated Business Arrangement Disclosure",
      hint: "Required when representing the seller.",
    });
  }

  if (representation === "buyer") {
    items.push({
      key: "home_inspection",
      label: "Get a Home Inspection",
      hint: "Required when representing the buyer.",
    });
  }

  const toggle = (key: ChecklistKey, value: boolean) =>
    onChange({ ...checklist, [key]: value });

  const completed = items.filter(i => checklist[i.key]).length;
  const total = items.length;
  const allDone = completed === total;

  return (
    <div className="space-y-3 border rounded-md p-4 bg-muted/20">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-sm font-semibold">Required Closing Documents</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Confirm each required document is present and signed. The AI will pre-check items it finds.
          </p>
        </div>
        <div
          className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded ${
            allDone
              ? "text-emerald-700 bg-emerald-100"
              : "text-amber-700 bg-amber-100"
          }`}
        >
          {allDone ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5" />
          )}
          {completed} of {total} confirmed
        </div>
      </div>

      <ul className="space-y-2 pt-2">
        {items.map(item => (
          <Fragment key={item.key}>
            <li className="flex items-start gap-2">
              <Checkbox
                id={`chk-${item.key}`}
                checked={!!checklist[item.key]}
                onCheckedChange={c => toggle(item.key, !!c)}
                className="mt-0.5"
              />
              <label
                htmlFor={`chk-${item.key}`}
                className="text-sm cursor-pointer leading-tight"
              >
                <span className={checklist[item.key] ? "line-through text-muted-foreground" : ""}>
                  {item.label}
                </span>
                {item.hint && (
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {item.hint}
                  </span>
                )}
              </label>
            </li>
            {item.key === "residential_property_disclosure" && (
              <li className="flex items-center gap-2 pl-6">
                <Checkbox
                  id="built-before-1978"
                  checked={builtBefore1978}
                  onCheckedChange={c => onBuiltBefore1978Change(!!c)}
                />
                <label htmlFor="built-before-1978" className="text-xs cursor-pointer text-muted-foreground">
                  Home was built prior to 1978 (requires Lead Paint Disclosure)
                </label>
              </li>
            )}
          </Fragment>
        ))}
      </ul>
    </div>
  );
};

export default ClosingPaperworkChecklist;
