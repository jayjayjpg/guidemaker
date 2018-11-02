'use strict';

const BroccoliMergeTrees = require('broccoli-merge-trees');
const Funnel = require('broccoli-funnel');
const StaticSiteJson = require('broccoli-static-site-json');
const walkSync = require('walk-sync');
const writeFile = require('broccoli-file-creator');
const yaml = require('js-yaml');
const resolve = require('resolve');

const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { Serializer } = require('jsonapi-serializer');
const { extname } = require('path');

const VersionsSerializer = new Serializer('version', {
  attributes: [
    'allVersions',
    'currentVersion',
  ],
});

module.exports = {
  name: 'guidemaker',
  urlsForPrember() {
    const guidesSrcPkg = this.getGuidesSrcPkg();
    let urls = []
    if(!existsSync(`${guidesSrcPkg}/versions.yml`)) {
      const paths = walkSync(`${guidesSrcPkg}/guides`);

      const mdFiles = paths.
        filter(path => extname(path) === '.md')
        .map(path => path.replace(/\.md/, ''))
        .map(path => path.replace(/\/index$/, ''));

      mdFiles.forEach((file) => {
        urls.push(`/release/${file}`)
      });

      urls.push('/release')
    } else {
      const versions = yaml.safeLoad(readFileSync(`${guidesSrcPkg}/versions.yml`, 'utf8'));

      let premberVersions = [...versions.allVersions, 'release'];
      urls = [...urls, ...premberVersions.map(version => `/${version}`)];

      premberVersions.forEach((premberVersion) => {
        const filesVersion = ['current', 'release'].includes(premberVersion) ? versions.currentVersion : premberVersion;
        const paths = walkSync(`${guidesSrcPkg}/guides/${filesVersion}`);

        const mdFiles = paths.
          filter(path => extname(path) === '.md')
          .map(path => path.replace(/\.md/, ''))
          .map(path => path.replace(/\/index$/, ''));

        mdFiles.forEach((file) => {
          urls.push(`/${premberVersion}/${file}`)
        })
      });
    }

    return urls;
  },

  getGuidesSrcPkg() {
    if(this.app.options.guidemaker && this.app.options.guidemaker.source) {
      try {
        return resolve.sync(this.app.options.guidemaker.source, { basedir: process.cwd() });
      } catch (e) {
        // try getting nodemodeules directly
        let fullPath = join(process.cwd(), 'node_modules', this.app.options.guidemaker.source);
        if(existsSync(fullPath)) {
          return fullPath;
        }
      }

    } else if(existsSync(join(process.cwd(), 'guides'))) {
      return process.cwd();
    }
  },

  treeForPublic() {
    let guidesSrcPkg = this.getGuidesSrcPkg();
    let broccoliTrees = [];

    // if there is an external guides source
    if(guidesSrcPkg !== process.cwd()) {
      if(existsSync(`${guidesSrcPkg}/public`)) {
        broccoliTrees.push(new Funnel(`${guidesSrcPkg}/public`))
      }
    }

    if(!guidesSrcPkg) {
      throw new Error('You must either define "source" in your ember-cli-build or have a `guides` directory in your project.')
    }

    // the source package does not support versions
    if(!existsSync(`${guidesSrcPkg}/versions.yml`)) {
      broccoliTrees.push(new StaticSiteJson(`${guidesSrcPkg}/guides`, {
        contentFolder: `content/release`,
        contentTypes: ['content', 'description'],
        type: 'contents',
        attributes: ['canonical', 'redirect'],
      }))
    } else {
      const versions = yaml.safeLoad(readFileSync(`${guidesSrcPkg}/versions.yml`, 'utf8'));

      let premberVersions = [...versions.allVersions, 'release'];
      const urls = premberVersions.map(version => `/${version}`);


      premberVersions.forEach((premberVersion) => {
        const filesVersion = ['current', 'release'].includes(premberVersion) ? versions.currentVersion : premberVersion;
        const paths = walkSync(`${guidesSrcPkg}/guides/${filesVersion}`);

        const mdFiles = paths.
          filter(path => extname(path) === '.md')
          .map(path => path.replace(/\.md/, ''))
          .map(path => path.replace(/\/index$/, ''));

        mdFiles.forEach((file) => {
          urls.push(`/${premberVersion}/${file}`)
        })
      });

      const jsonTrees = versions.allVersions.map((version) => new StaticSiteJson(`${guidesSrcPkg}/guides/${version}`, {
        contentFolder: `content/${version}`,
        contentTypes: ['content', 'description'],
        type: 'contents',
        attributes: ['canonical', 'redirect'],
      }));

      // setting an ID so that it's not undefined
      versions.id = 'versions';
      const versionsFile = writeFile('/content/versions.json', JSON.stringify(VersionsSerializer.serialize(versions)));

      broccoliTrees.push(versionsFile);
      broccoliTrees = [...broccoliTrees, ...jsonTrees];
    }

    return new BroccoliMergeTrees(broccoliTrees);
  },

  config(env, config) {
    let fastboot = config.fastboot || {};

    if(fastboot.hostWhitelist) {
      fastboot.hostWhitelist.push(/localhost:\d+/);
    } else {
      fastboot.hostWhitelist = [/localhost:\d+/];
    }

    return {
      fastboot,
      // TODO: investigate this bug - remove it and see why it breaks
      'ember-collapsible-panel': config['ember-collapsible-panel'] || {}
    }
  },
};
