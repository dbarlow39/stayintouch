import { PropertyData, ClosingCostData } from "@/types/property";

export function calculateClosingCosts(data: PropertyData): ClosingCostData {
  const offerPrice = data.offerPrice || 0;
  
  // Calculate commissions
  const listingCommission = offerPrice * (data.listingAgentCommission / 100);
  const buyerCommission = offerPrice * (data.buyerAgentCommission / 100);
  
  // Calculate taxes due for current year
  const taxesDueForYear = (data.annualTaxes / 365) * data.taxDaysDueThisYear;
  
  // Calculate tax halves if paid (0 if paid, calculated amount if not paid)
  const taxesFirstHalf = data.firstHalfPaid ? 0 : (data.daysFirstHalfTaxes || Math.round(data.annualTaxes / 2));
  const taxesSecondHalf = data.secondHalfPaid ? 0 : (data.daysSecondHalfTaxes || Math.round(data.annualTaxes / 2));
  
  // Fixed fees
  const countyConveyanceFee = offerPrice * 0.004; // 0.4% typical
  const titleExamination = 300;
  const titleSettlement = 300;
  const closingFee = 125;
  const deedPreparation = 95;
  const overnightFee = 50;
  const recordingFee = 125;
  const surveyCoverage = 100;
  
  // Title insurance calculation with tiered rates
  const titleInsurance = Math.round(
    Math.min(offerPrice, 150000) * 6.75 / 1000 +
    Math.max(Math.min(offerPrice - 150000, 100000), 0) * 5.25 / 1000 +
    Math.max(Math.min(offerPrice - 250000, 250000), 0) * 4.25 / 1000 +
    Math.max(offerPrice - 500000, 0) * 3.75 / 1000
  );
  
  // Calculate estimated net: offer price minus all costs
  const estimatedNet = offerPrice 
    - data.firstMortgage 
    - data.secondMortgage 
    - data.closingCost 
    - taxesFirstHalf 
    - taxesSecondHalf 
    - Math.round(taxesDueForYear)
    - Math.round(listingCommission)
    - Math.round(buyerCommission)
    - Math.round(countyConveyanceFee)
    - data.homeWarranty
    - titleExamination
    - titleSettlement
    - closingFee
    - deedPreparation
    - overnightFee
    - recordingFee
    - surveyCoverage
    - data.adminFee
    - titleInsurance;
  
  return {
    sellingPrice: offerPrice,
    firstMortgage: data.firstMortgage,
    secondMortgage: data.secondMortgage,
    buyerClosingCost: data.closingCost,
    annualTaxes: data.annualTaxes,
    taxesFirstHalf: taxesFirstHalf,
    taxesSecondHalf: taxesSecondHalf,
    taxesDueForYear: Math.round(taxesDueForYear),
    listingAgentCommission: Math.round(listingCommission),
    buyerAgentCommission: Math.round(buyerCommission),
    countyConveyanceFee: Math.round(countyConveyanceFee),
    homeWarranty: data.homeWarranty,
    homeWarrantyCompany: data.homeWarrantyCompany,
    titleExamination,
    titleSettlement,
    closingFee,
    deedPreparation,
    overnightFee,
    recordingFee,
    surveyCoverage,
    adminFee: data.adminFee,
    titleInsurance,
    estimatedNet: Math.round(estimatedNet)
  };
}
