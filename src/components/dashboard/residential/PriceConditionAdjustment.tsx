import { inspectionSections } from "@/data/inspectionData";
import { Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PriceConditionAdjustmentProps {
  inspectionData: Record<string, any>;
}

const getConditionLevel = (avg: number) => {
  if (avg >= 4.5) return { label: "Excellent", adjustment: "+10%", color: "text-green-600 dark:text-green-400" };
  if (avg >= 3.5) return { label: "Above Average", adjustment: "+5%", color: "text-emerald-600 dark:text-emerald-400" };
  if (avg >= 2.5) return { label: "Average", adjustment: "0%", color: "text-yellow-600 dark:text-yellow-400" };
  if (avg >= 1.5) return { label: "Below Average", adjustment: "-5%", color: "text-orange-600 dark:text-orange-400" };
  if (avg > 0) return { label: "Fair", adjustment: "-10% to -15%", color: "text-destructive" };
  return { label: "Not Rated", adjustment: "N/A", color: "text-muted-foreground" };
};

const renderStars = (count: number) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map((s) => (
      <Star
        key={s}
        className={`w-4 h-4 ${s <= Math.round(count) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
      />
    ))}
  </div>
);

const PriceConditionAdjustment = ({ inspectionData }: PriceConditionAdjustmentProps) => {
  // Collect ratings from all sections (skip property-info as it's informational)
  const ratedSections = inspectionSections
    .filter((s) => s.id !== "property-info")
    .map((section) => ({
      id: section.id,
      title: section.title,
      rating: Number(inspectionData[section.id]?.rating) || 0,
    }));

  const sectionsWithRatings = ratedSections.filter((s) => s.rating > 0);
  const totalStars = sectionsWithRatings.reduce((sum, s) => sum + s.rating, 0);
  const totalPossible = sectionsWithRatings.length * 5;
  const averageScore = totalPossible > 0 ? (totalStars / totalPossible) * 5 : 0;
  const condition = getConditionLevel(averageScore);

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Price and Condition Adjustment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Section breakdown */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Section Ratings</h4>
          <div className="grid gap-2">
            {ratedSections.map((section) => (
              <div key={section.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm font-medium">{section.title}</span>
                <div className="flex items-center gap-2">
                  {section.rating > 0 ? (
                    <>
                      {renderStars(section.rating)}
                      <span className="text-sm text-muted-foreground w-8 text-right">{section.rating}/5</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Not rated</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Sections Rated</span>
            <span className="text-sm font-semibold">{sectionsWithRatings.length} / {ratedSections.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total Stars</span>
            <span className="text-sm font-semibold">{totalStars} / {totalPossible || "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Average Score</span>
            <div className="flex items-center gap-2">
              {renderStars(averageScore)}
              <span className="text-sm font-semibold">{averageScore > 0 ? averageScore.toFixed(1) : "—"}</span>
            </div>
          </div>
          <div className="border-t pt-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Condition Level</span>
            <span className={`text-sm font-bold ${condition.color}`}>{condition.label}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Suggested Price Adjustment</span>
            <span className={`text-lg font-bold ${condition.color}`}>{condition.adjustment}</span>
          </div>
        </div>

        {/* Recommendation */}
        {averageScore > 0 && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <h4 className="text-sm font-semibold mb-1">Recommendation</h4>
            <p className="text-sm text-muted-foreground">
              {averageScore >= 4.5
                ? "This property is in excellent condition. The above-average maintenance and updates support a price premium of approximately 10% above comparable sales."
                : averageScore >= 3.5
                ? "This property is in above-average condition. Minor updates and well-maintained systems support a modest price premium of approximately 5% above comparable sales."
                : averageScore >= 2.5
                ? "This property is in average condition for its age and area. Pricing should be in line with comparable sales with no significant adjustment needed."
                : averageScore >= 1.5
                ? "This property shows some deferred maintenance. A price reduction of approximately 5% below comparable sales is recommended to account for needed repairs and updates."
                : "This property requires significant repairs and updates. A price reduction of 10–15% below comparable sales is recommended to reflect the current condition and anticipated renovation costs."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PriceConditionAdjustment;
