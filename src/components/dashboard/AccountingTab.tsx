import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const AccountingTab = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Accounting</CardTitle>
        <CardDescription>Admin-only accounting dashboard</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Accounting features coming soon. Provide your prompt to build this out.</p>
      </CardContent>
    </Card>
  );
};

export default AccountingTab;
