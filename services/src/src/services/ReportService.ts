import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import { generatePDF } from '../utils/pdf';
import { formatReportDateTime } from '../utils/reportDateTime.js';
import prismaClient from "../prisma"

class ReportService {
  async projeto(project_id: string) {
    const detail = await prismaClient.project.findFirst({
      where: { id: project_id },
      select: {
        id: true,
        name: true,
        client_id: true,
        status: true,
        start_date: true,
        end_date: true,
        objective: true,
        sponsor_id: true,
        porcentage: true,
        client: {
          select: {
            company_name: true,
            cpf_cnpj: true,
            opening_date: true,
            responsible: true,
            number: true,
            email: true,
            instagram: true,
            regime: true,
          }
        },
        tasks: {
          select: {
            name: true,
            status: true,
            date_updated: true,
            department_id: true,
            responsible_id: true,
            observations: true,
            department: {
              select: {
                name: true
              }
            },
            responsible: {
              select: {
                name: true
              }
            },
            responsible2: {
              select: {
                name: true
              }
            },
            responsible3: {
              select: {
                name: true
              }
            },
          }
        }
      }
    });

    if (!detail) {
      throw new Error('Projeto não encontrado.');
    }

    const clientInfo = {
      company: detail.client.company_name,
      cpf_cnpj: detail.client.cpf_cnpj,
      openDate: detail.client.opening_date ?? '-',
      partner: detail.client.responsible,
      contact: detail.client.number,
      email: detail.client.email,
      instagram: detail.client.instagram,
      start: detail.start_date ? new Date(detail.start_date).toLocaleDateString() : '-',
      regime: detail.client.regime ?? '-',
      projectObjective: detail.objective,
      projectStartDate: detail.start_date ? new Date(detail.start_date).toLocaleDateString() : '-',
      projectEndDate: detail.end_date ? new Date(detail.end_date).toLocaleDateString() : '-',
      percent: detail.porcentage,
    };

    const templatePath = path.resolve(__dirname, '..', 'templates', 'projeto.hbs');
    const file = fs.readFileSync(templatePath, 'utf-8');

    const logoBuffer = fs.readFileSync("src/assets/logos/logo-castelo.png");
    const mime = path.extname("src/assets/logos/logo-castelo.png") === '.jpg' ? 'image/jpeg' : 'image/png';
    const logoBase64 = `data:${mime};base64,${logoBuffer.toString('base64')}`;

    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - clientInfo.percent / 100);

    const template = handlebars.compile(file);

    function generateRows(data: any[]): string {
      return data.map((item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>-</td>
        <td>${item.name}</td>
        <td>${item.status}</td>
        <td>${item.date_updated ? new Date(item.date_updated).toLocaleDateString() : '-'}</td>
        <td>${item.department.name ?? '-'}</td>
        <td>${[item.responsible?.name, item.responsible2?.name, item.responsible3?.name]
          .filter(Boolean)
          .join(', ') || '-'}
        </td>
        <td>${item.observations || '-'}</td>
      </tr>
    `).join('');
    }

    const html = template({
      ...clientInfo,
      logoUrl: logoBase64,
      dashOffset,
      dataHoraAtual: formatReportDateTime(new Date()),
      rows: generateRows(detail.tasks),
    });

    return await generatePDF(html);
  }

}

export { ReportService };
