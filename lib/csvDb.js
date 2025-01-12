const { readFile, writeFile, access } = require('fs');
const util = require('util');
const config = require('./config');
const { promisify } = require('util');

process.on('unhandledRejection', r => console.log(r));

const promisedReadFile = promisify(readFile);
const promisedWriteFile = promisify(writeFile);
const promisedAccess = promisify(access);

class CsvDB {
  constructor(file, fields = null, conf = { failIfNotExists: false }) {
    this.file = file;
    this.fields = fields;
    this.conf = conf;
  }

  getFileContent() {
    return promisedReadFile(this.file, 'utf-8');
  }

  transform(input) {
    if (input === '') {
      return [];
    }

    const lines = input.split(config.lineSeparator);
    let fields;
    if (this.fields === null) {
      fields = lines
        .shift()
        .split(config.delimiter)
        .map(field => field.trim());
      if (fields[fields.length - 1] === '') {
        fields.pop();
      }
    } else {
      fields = this.fields;
    }
    const result = [];
    if (Array.isArray(lines) && lines.length > 0) {
      for (let i = 0; i < lines.length; i++) {
        result[i] = {};
        let cols = lines[i].split(config.delimiter);

        for (let j = 0; j < fields.length; j++) {
          result[i][fields[j]] = cols[j];
        }
      }
    }
    return result;
  }

  async get(stmt) {
    let keys, last;
    const result = [];
    const data = await this.getFileContent();
    const rows = this.transform(data);
    rows.shift();
    if (stmt) {
      keys = Object.keys(stmt);
      last = keys[keys.length - 1];
    }

    if (stmt) {
      rows.filter(row => {
        Object.keys(stmt).forEach(key => {
          if (row[key] != stmt[key]) return;
          else if (key == last) {
            result.push(row);
          }
        });
      })
      return result;
    }
    else {
      rows.filter(row => result.push(row));
      return result;
    }
  }


  async getNextId() {
    const data = await this.get();

    if (Array.isArray(data) && data.length === 0) {
      return 1;
    }

    const lastIndex = data.reduce((prev, curr) => {
      const itemId = parseInt(curr['id'], 10);
      return prev < itemId ? itemId : prev;
    }, 0);

    return lastIndex + 1;
  }

  async insert(newData) {
    const data = await this.get();
    const nextId = await this.getNextId();

    newData.id = nextId;
    data.push(newData);

    await promisedWriteFile(this.file, this.flatten(data));

    return nextId;
  }

  async writeFile(filename, content) {
    if (this.conf.failIfNotExists) {
      await promisedAccess(filename);
    }
    return promisedWriteFile(filename, content);
  }

  flatten(input) {
    const result = [];
    let row = [];

    if (Array.isArray(input) && input.length > 0) {
      let fields = Object.keys(input[0]);
      result.push(fields.join(config.delimiter) + config.delimiter);

      for (let i = 0; i < input.length; i++) {
        row = [];
        for (let j = 0; j < fields.length; j++) {
          row.push(input[i][fields[j]]);
        }
        result.push(row.join(config.delimiter) + config.delimiter);
      }
    }
    return result.join(config.lineSeparator);
  }

  async update(data) {
    let existingContent = await this.get();

    if (!Array.isArray(data)) {
      data = [data];
    }
    for (let i = 0; i < data.length; i++) {
      existingContent = existingContent.map(item => {
        if (item.id === data[i].id.toString()) {
          return Object.assign(item, data[i]);
        }
        return item;
      });
    }

    return promisedWriteFile(this.file, this.flatten(existingContent));
  }

  async delete(id) {
    const data = await this.get();

    for (let i = 0; i < data.length; i++) {
      if (data[i].id == id) {
        data.splice(i, 1);
        break;
      }
    }
    return promisedWriteFile(this.file, this.flatten(data));
  }
}

module.exports = CsvDB;
