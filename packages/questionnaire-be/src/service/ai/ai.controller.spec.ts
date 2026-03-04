import { Test, TestingModule } from '@nestjs/testing';
import { AiController } from '@/service/ai/ai.controller';
import { AiService } from '@/service/ai/ai.service';
import { of } from 'rxjs';
import { Observable } from 'rxjs';

describe('AiController', () => {
  let aiController: AiController;
  let aiService: {
    generate: jest.Mock;
    updateMetricOutcome: jest.Mock;
    getMetricSummary: jest.Mock;
    getMetricTimeseries: jest.Mock;
  };

  beforeEach(async () => {
    aiService = {
      generate: jest.fn().mockReturnValue(of({ data: 'test' })),
      updateMetricOutcome: jest.fn().mockResolvedValue(true),
      getMetricSummary: jest.fn().mockResolvedValue({ requestCount: 3 }),
      getMetricTimeseries: jest
        .fn()
        .mockResolvedValue([
          { bucket: '2026-03-29T00:00:00', requestCount: 2 },
        ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        {
          provide: AiService,
          useValue: aiService,
        },
      ],
    }).compile();

    aiController = module.get<AiController>(AiController);
  });

  it('should be defined', () => {
    expect(aiController).toBeDefined();
  });

  it('should call aiService.generate with the correct theme', async () => {
    const theme = 'test-theme';
    await aiController.generate(theme, 10, undefined as any);
    expect(aiService.generate).toHaveBeenCalledWith(theme, 10, undefined);
  });

  it('should return an Observable', async () => {
    const theme = 'test-theme';
    const result = await aiController.generate(theme, 10, undefined as any);
    expect(result).toBeInstanceOf(Observable);
  });

  it('should forward outcome updates to AiService', async () => {
    const result = await aiController.updateMetricOutcome(
      'req-1',
      {
        draftApplied: true,
      },
      {
        userId: 9,
      } as any,
    );

    expect(aiService.updateMetricOutcome).toHaveBeenCalledWith(
      'req-1',
      {
        draftApplied: true,
      },
      9,
    );
    expect(result.code).toBe(1);
    expect(result.data).toEqual({ updated: true });
  });

  it('should forward summary queries to AiService', async () => {
    const query = {
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-31T00:00:00.000Z',
    };

    const result = await aiController.getMetricSummary(
      query as any,
      {
        userId: 9,
      } as any,
    );

    expect(aiService.getMetricSummary).toHaveBeenCalledWith(query, 9);
    expect(result.code).toBe(1);
    expect(result.data).toEqual({ requestCount: 3 });
  });

  it('should forward timeseries queries to AiService', async () => {
    const query = {
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-31T00:00:00.000Z',
      bucket: 'day',
    };

    const result = await aiController.getMetricTimeseries(
      query as any,
      {
        userId: 9,
      } as any,
    );

    expect(aiService.getMetricTimeseries).toHaveBeenCalledWith(query, 9);
    expect(result.code).toBe(1);
    expect(result.data).toEqual([
      {
        bucket: '2026-03-29T00:00:00',
        requestCount: 2,
      },
    ]);
  });
});
