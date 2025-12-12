import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import FormData from 'form-data';

@Injectable()
export class ModerationService {
  async checkImage(filePath: string, filename: string) {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), filename);

    try {
      const res = await axios.post(
        'http://127.0.0.1:5000/moderation-image',
        form,
        {
          headers: form.getHeaders(),
        },
      );

      return res.data; // { is_safe, unsafe_score }
    } catch (err) {
      console.error('Error checking image:', err.message);
      return { is_safe: true }; // fallback để không crash hệ thống
    }
  }
}
