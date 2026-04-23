import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  create(reporterId: string, dto: CreateReportDto) {
    return this.prisma.report.create({
      data: {
        reporterId,
        typeReport: dto.typeReport,
        title: dto.title,
        description: dto.description,
        image: dto.image,
        url: dto.url,
        emailToContact: dto.emailToContact,
      },
    });
  }
}
