import { FinancialTemplate, FINANCIAL_TEMPLATES } from '@/constants/financialTemplates';

/**
 * Metadata for the financial report template
 */
export interface TemplateMetadata {
    ticker?: string;
    fiscal_year?: string;
    report_type?: string;
    quarter?: number | string;
    template_id?: string;
}

/**
 * Generates an empty JSON structure for a given financial template
 */
export function generateEmptyJson(template: FinancialTemplate, metadata?: TemplateMetadata) {
    const result: any = {
        metadata: metadata || {
            ticker: "",
            fiscal_year: "",
            report_type: "",
            quarter: ""
        },
        balance_sheet: {},
        profit_loss: {},
        cash_flow: template.sections.cash_flow ? {} : undefined
    };

    template.sections.balance_sheet.forEach(section => {
        result.balance_sheet[section.key] = {};
        section.particulars.forEach(p => {
            result.balance_sheet[section.key][p.key] = null;
        });
    });

    template.sections.profit_loss.forEach(section => {
        result.profit_loss[section.key] = {};
        section.particulars.forEach(p => {
            result.profit_loss[section.key][p.key] = null;
        });
    });

    if (template.sections.cash_flow) {
        template.sections.cash_flow.forEach(section => {
            result.cash_flow[section.key] = {};
            section.particulars.forEach(p => {
                result.cash_flow[section.key][p.key] = null;
            });
        });
    }

    return result;
}

/**
 * Triggers a browser download of the JSON template
 */
export function downloadJsonTemplate(templateId: string, fileName: string, metadata?: TemplateMetadata) {
    const template = FINANCIAL_TEMPLATES[templateId];
    if (!template) {
        console.error(`Template ${templateId} not found`);
        return;
    }

    const json = generateEmptyJson(template, metadata);
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
