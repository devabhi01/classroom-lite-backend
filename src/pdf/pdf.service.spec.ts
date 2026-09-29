import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PdfService } from './pdf.service.js';

describe('PdfService', () => {
  let service: PdfService;
  let mockClassroomModel: any;

  beforeEach(() => {
    mockClassroomModel = {
      findById: vi.fn(),
    };
    service = new PdfService(mockClassroomModel);
  });

  describe('sharePdf', () => {
    it('should set activePdf with currentPage starting at 1', async () => {
      const classroom = {
        _id: new Types.ObjectId(),
        activePdf: null as any,
        save: vi.fn().mockResolvedValue(true),
      };
      mockClassroomModel.findById.mockResolvedValue(classroom);

      const result = await service.sharePdf(classroom._id.toString(), {
        fileName: 'react-guide.pdf',
        fileUrl: 'https://example.com/react-guide.pdf',
        totalPages: 25,
      });

      expect(result.fileName).toBe('react-guide.pdf');
      expect(result.currentPage).toBe(1);
      expect(result.totalPages).toBe(25);
      expect(classroom.activePdf).toBeDefined();
    });

    it('should throw NotFoundException if classroom is not found', async () => {
      mockClassroomModel.findById.mockResolvedValue(null);

      await expect(
        service.sharePdf(new Types.ObjectId().toString(), {
          fileName: 'react-guide.pdf',
          fileUrl: 'https://example.com/react-guide.pdf',
          totalPages: 25,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('changePage', () => {
    it('should update current page when within valid bounds', async () => {
      const classroom = {
        _id: new Types.ObjectId(),
        activePdf: {
          fileName: 'react-guide.pdf',
          fileUrl: 'https://example.com/react-guide.pdf',
          totalPages: 25,
          currentPage: 1,
        },
        markModified: vi.fn(),
        save: vi.fn().mockResolvedValue(true),
      };
      mockClassroomModel.findById.mockResolvedValue(classroom);

      const result = await service.changePage(classroom._id.toString(), 10);
      expect(result.currentPage).toBe(10);
      expect(classroom.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if page exceeds totalPages', async () => {
      const classroom = {
        _id: new Types.ObjectId(),
        activePdf: {
          totalPages: 25,
          currentPage: 1,
        },
        markModified: vi.fn(),
        save: vi.fn().mockResolvedValue(true),
      };
      mockClassroomModel.findById.mockResolvedValue(classroom);

      await expect(service.changePage(classroom._id.toString(), 30)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('closePdf', () => {
    it('should set activePdf to null and save', async () => {
      const classroom = {
        _id: new Types.ObjectId(),
        activePdf: { fileName: 'react-guide.pdf' },
        save: vi.fn().mockResolvedValue(true),
      };
      mockClassroomModel.findById.mockResolvedValue(classroom);

      const result = await service.closePdf(classroom._id.toString());
      expect(result).toBe(true);
      expect(classroom.activePdf).toBeNull();
    });
  });
});
