import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InventoryRow {
  mls_id: string;
  address: string;
  city: string;
  status: string;
  price: number | null;
  agent: string;
  showings_to_date: number | null;
  days_on_market: number | null;
}

// Parse address into street number and street name
function parseAddress(address: string): { street_number: string; street_name: string } {
  const trimmed = address.trim();
  // Match patterns like "123 Main Street" or "123-125 Main Street"
  const match = trimmed.match(/^([\d\-]+)\s+(.+)$/);
  if (match) {
    return {
      street_number: match[1],
      street_name: match[2]
    };
  }
  return { street_number: '', street_name: trimmed };
}

// Parse price from string like "$429,900"
function parsePrice(priceStr: string): number | null {
  if (!priceStr) return null;
  const cleaned = priceStr.replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Parse integer from string
function parseInt(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(/,/g, '');
  const num = Number.parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

// Map listing status to standard format
function mapStatus(status: string): string {
  const upper = status.toUpperCase().trim();
  if (upper === 'ACTIVE') return 'A';
  if (upper === 'PENDING') return 'P';
  if (upper === 'CONTINGENT') return 'C';
  if (upper === 'CLOSED') return 'CL';
  if (upper === 'CANCELLED' || upper === 'CANCELED') return 'CA';
  if (upper === 'EXPIRED') return 'EXP';
  if (upper === 'TEMP OFF MARKET' || upper === 'TEMP OFF') return 'TOM';
  if (upper === 'ESCAPE') return 'ESC';
  if (upper === 'MARKET') return 'A';
  return status;
}

// Parse markdown table row
function parseTableRow(row: string): string[] {
  // Split by | and filter out empty entries
  return row.split('|')
    .map(cell => cell.trim())
    .filter((cell, index, arr) => index > 0 && index < arr.length - 1 || cell);
}

// Extract inventory data from parsed markdown
function extractInventoryFromMarkdown(markdown: string): InventoryRow[] {
  const rows: InventoryRow[] = [];
  const lines = markdown.split('\n');
  
  let inTable = false;
  let headerColumns: string[] = [];
  let columnIndices: Record<string, number> = {};
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines
    if (!trimmedLine) continue;
    
    // Detect table header (contains multiple |)
    if (trimmedLine.includes('|') && trimmedLine.includes('Address')) {
      inTable = true;
      headerColumns = parseTableRow(trimmedLine);
      
      // Map column names to indices
      headerColumns.forEach((col, idx) => {
        const lower = col.toLowerCase();
        if (lower.includes('source number') || lower.includes('mls')) {
          columnIndices['mls_id'] = idx;
        } else if (lower === 'address') {
          columnIndices['address'] = idx;
        } else if (lower === 'city') {
          columnIndices['city'] = idx;
        } else if (lower.includes('listing status') || lower === 'status') {
          columnIndices['status'] = idx;
        } else if (lower.includes('listing price') || lower === 'price') {
          columnIndices['price'] = idx;
        } else if (lower.includes('listing agent') || lower === 'agent') {
          columnIndices['agent'] = idx;
        } else if (lower.includes('showings last 30') || lower.includes('showings_to_date')) {
          columnIndices['showings'] = idx;
        } else if (lower.includes('days on market') || lower.includes('last days')) {
          columnIndices['dom'] = idx;
        }
      });
      
      console.log('Detected columns:', columnIndices);
      continue;
    }
    
    // Skip separator rows (-----)
    if (inTable && trimmedLine.match(/^\|[\s\-:]+\|$/)) {
      continue;
    }
    
    // Parse data row
    if (inTable && trimmedLine.includes('|')) {
      const cells = parseTableRow(trimmedLine);
      
      // Skip if it looks like another header or separator
      if (cells.some(c => c.includes('---'))) continue;
      
      const mlsId = cells[columnIndices['mls_id']] || '';
      const address = cells[columnIndices['address']] || '';
      const city = cells[columnIndices['city']] || '';
      const status = cells[columnIndices['status']] || '';
      const price = cells[columnIndices['price']] || '';
      const agent = cells[columnIndices['agent']] || '';
      const showings = cells[columnIndices['showings']] || '';
      const dom = cells[columnIndices['dom']] || '';
      
      // Skip if no MLS ID or address
      if (!mlsId && !address) continue;
      
      rows.push({
        mls_id: mlsId,
        address: address,
        city: city,
        status: mapStatus(status),
        price: parsePrice(price),
        agent: agent,
        showings_to_date: parseInt(showings),
        days_on_market: parseInt(dom)
      });
    }
  }
  
  console.log(`Extracted ${rows.length} inventory rows`);
  return rows;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { markdown_content } = await req.json();

    if (!markdown_content) {
      return new Response(
        JSON.stringify({ success: false, error: 'Markdown content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Parsing inventory from markdown, length:', markdown_content.length);
    
    const inventoryRows = extractInventoryFromMarkdown(markdown_content);
    
    // Transform to client format
    const clients = inventoryRows.map(row => {
      const { street_number, street_name } = parseAddress(row.address);
      return {
        mls_id: row.mls_id,
        street_number,
        street_name,
        city: row.city,
        status: row.status,
        price: row.price,
        agent: row.agent,
        showings_to_date: row.showings_to_date,
        days_on_market: row.days_on_market,
        // Set owner names from the address for seller listings
        first_name: '',
        last_name: ''
      };
    });

    console.log(`Transformed ${clients.length} clients`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: clients,
        count: clients.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error parsing inventory:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
