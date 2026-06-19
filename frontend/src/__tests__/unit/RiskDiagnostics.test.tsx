import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RiskDiagnostics } from '@/components/RiskRadar';

const stateWith = (alerts: { type: string; level: 'HIGH' | 'MEDIUM' | 'LOW'; message: string }[]) => ({
    loading: false,
    error: null,
    data: {
        radar_data: [{ axis: 'Concentration', value: 5, fullMark: 10 }],
        alerts,
        summary: { total_value: 1000, risk_level: 'LOW' as const },
    },
});

describe('RiskDiagnostics', () => {
    it('shows the all-clear message when there are no alerts', () => {
        render(<RiskDiagnostics state={stateWith([])} />);
        expect(screen.getByText(/No major risks detected/i)).toBeInTheDocument();
    });

    it('renders each alert type and message', () => {
        render(<RiskDiagnostics state={stateWith([{ type: 'Concentration', level: 'HIGH', message: 'Too much in banking' }])} />);
        expect(screen.getByText('Concentration')).toBeInTheDocument();
        expect(screen.getByText('Too much in banking')).toBeInTheDocument();
    });
});
