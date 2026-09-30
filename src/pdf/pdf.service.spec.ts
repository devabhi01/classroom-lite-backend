import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PdfService } from './pdf.service.js';

describe('PdfService', () => {
  let service: PdfService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      classroom: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    service = new PdfService(mockPrisma);
  });

  describe('sharePdf', () => {
    it('should set activePdf with currentPage starting at 1', async () => {
      const classroom = {
        id: 'classroom-uuid-1',
        name: 'Test Classroom',
      };
      mockPrisma.classroom.findUnique.mockResolvedValue(classroom);
      mockPrisma.classroom.update.mockResolvedValue({
        ...classroom,
        activePdfFileName: 'react-guide.pdf',
        activePdfFileUrl: 'https://example.com/react-guide.pdf',
        activePdfTotalPages: 25,
        activePdfCurrentPage: 1,
      });

      const result = await service.sharePdf(classroom.id, {
        fileName: 'react-guide.pdf',
        fileUrl: 'https://example.com/react-guide.pdf',
        totalPages: 25,
      });

      expect(result.fileName).toBe('react-guide.pdf');
      expect(result.currentPage).toBe(1);
      expect(result.totalPages).toBe(25);
      expect(mockPrisma.classroom.update).toHaveBeenCalledWith({
        where: { id: classroom.id },
        data: {
          activePdfFileName: 'react-guide.pdf',
          activePdfFileUrl: 'https://example.com/react-guide.pdf',
          activePdfTotalPages: 25,
          activePdfCurrentPage: 1,
        },
      });
    });

    it('should throw NotFoundException if classroom is not found', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue(null);

      await expect(
        service.sharePdf('nonexistent-uuid', {
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
        id: 'classroom-uuid-1',
        activePdfFileName: 'react-guide.pdf',
        activePdfFileUrl: 'https://example.com/react-guide.pdf',
        activePdfTotalPages: 25,
        activePdfCurrentPage: 1,
      };
      mockPrisma.classroom.findUnique.mockResolvedValue(classroom);
      mockPrisma.classroom.update.mockResolvedValue({
        ...classroom,
        activePdfCurrentPage: 10,
      });

      const result = await service.changePage(classroom.id, 10);
      expect(result.currentPage).toBe(10);
      expect(mockPrisma.classroom.update).toHaveBeenCalledWith({
        where: { id: classroom.id },
        data: { activePdfCurrentPage: 10 },
      });
    });

    it('should throw BadRequestException if page exceeds totalPages', async () => {
      const classroom = {
        id: 'classroom-uuid-1',
        activePdfFileName: 'react-guide.pdf',
        activePdfTotalPages: 25,
        activePdfCurrentPage: 1,
      };
      mockPrisma.classroom.findUnique.mockResolvedValue(classroom);

      await expect(service.changePage(classroom.id, 30)).rejects.toThrow(BadRequestException);
    });
  });

  describe('closePdf', () => {
    it('should set activePdf fields to null', async () => {
      const classroom = {
        id: 'classroom-uuid-1',
        activePdfFileName: 'react-guide.pdf',
      };
      mockPrisma.classroom.findUnique.mockResolvedValue(classroom);
      mockPrisma.classroom.update.mockResolvedValue({
        ...classroom,
        activePdfFileName: null,
      });

      const result = await service.closePdf(classroom.id);
      expect(result).toBe(true);
      expect(mockPrisma.classroom.update).toHaveBeenCalledWith({
        where: { id: classroom.id },
        data: {
          activePdfFileName: null,
          activePdfFileUrl: null,
          activePdfTotalPages: null,
          activePdfCurrentPage: null,
        },
      });
    });
  });
});
