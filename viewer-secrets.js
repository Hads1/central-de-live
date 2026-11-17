const fs = require('node:fs');
class ViewerSecrets {
  constructor(file, storage) {
    this.file = file;
    this.storage = storage;
  }
  load() {
    if (!fs.existsSync(this.file)) return {};
    if (!this.storage.isEncryptionAvailable())
      throw Error('Proteção de credenciais do Windows indisponível.');
    return JSON.parse(this.storage.decryptString(fs.readFileSync(this.file)));
  }
  save(values) {
    if (!this.storage.isEncryptionAvailable())
      throw Error('Proteção de credenciais do Windows indisponível.');
    const encoded = this.storage.encryptString(JSON.stringify(values));
    fs.writeFileSync(this.file + '.tmp', encoded);
    fs.renameSync(this.file + '.tmp', this.file);
  }
}
module.exports = { ViewerSecrets };
