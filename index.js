const fs = require('fs');
const http = require('http');
const https = require('https');
const cheerio = require('cheerio');

/**
 * Converts a star string (★★★★☆) to a number (4.0).
 * @param {string} reviewStarsString A string containing stars.
 * @returns {number} The numeric value of the stars string.
 */
function reviewStarsToNumber (reviewStarsString = '') {
    return [...reviewStarsString].filter(v => v === '★').length;
}

/**
 * Converts a currency string into its actual numeric value.
 * @param {string} currencyString A string with currency label, value, and padding.
 * @returns {number} The extracted actual value from the string.
 */
function currencyStringToNumber (currencyString = '') {
    let value = parseFloat(
        currencyString.replace(/[R\$ ]/gi, '').replace(',','.')
    );
    return (isNaN(value) ? null : value);
}

/**
 * Fetch data from a specified URL.
 * @async
 * @param {string} url The URL endpoint to target the request.
 * @returns {Promise<string>} A promise resolving with the response body.
 * @throws Throws a native error for failed GET request, or a custom 'Request Timeout' error. 
 */
function asyncFetch (url) {
    const scheme = url.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
        const request = scheme.get(url, (res) => {
            const body = [];
            res.on('data', data => body.push(data));
            res.on('end', () => resolve(Buffer.concat(body).toString('utf8')));
        });
        request
            .on('timeout', reject)
            .on('error', reject)
            .end()
        ;
    });
};

class Product {
    constructor (url) {
        this.url = url;

        // Used with setBrand and setDescription
        this.title = '';
        this.brand = '';
        this.description = '';

        // Used with 'add*' acessors
        this.skus = [];
        this.reviews = [];
        this.categories = [];
        this.properties = [];
    };

    get reviews_average_score () {
        return this.reviews.map(v => v.score).reduce((a, b) => a + b) / this.reviews.length;
    }

    addCategory (categoryName = '') {
        return (this.categories.push(categoryName), this);
    };

    addSKU ({ name = '', current_price = '', old_price = '', available = false } = {}) {
        this.skus.push({ 
            name, 
            available,
            current_price: current_price, 
            old_price: old_price,
        });
        return this;
    };

    addProperty ({ label = '', value = '' } = {}) {
        this.properties.push({ label, value });
        return this;
    };

    addReview ({ name = '', date = '', score = 0, text = '' } = {}) {
        this.reviews.push({ name, date, score: parseInt(score, 10), text });
        return this;
    };

    toJSON () {
        return JSON.stringify(
            { ...this, reviews_average_score: this.reviews_average_score },
        null, '\t');
    };
};


(async function main () {
    const url = "https://infosimples.com/vagas/desafio/commercia/product.html";
    const body = await asyncFetch(url);
    const html = cheerio.load(body);
    const product = new Product(url);

    const selectors = {
        title: "h2#product_title",
        brand: "div.brand",
        description: "div.proddet p",
        categories: "nav.current-category a",
        skus: {
            main: "div.skus-area div.card-container",
            name: "div.prod-nome",
            current_price: "div.prod-pnow",
            old_price: "div.prod-pold",
            available: "i"
        },
        properties: {
            main: "h4:contains('Product properties')",
            additional: "div#propadd h4:contains('Additional properties')"
        },
        reviews: {
            main: "div#comments div.analisebox",
            name: "span.analiseusername",
            date: "span.analisedate",
            score: "span.analisestars",
            text: "p",
        }
    };

    // Get product title
    product.title = html(selectors.title).text();

    // Get product brand
    product.brand = html(selectors.brand).text();

    // Get product description
    product.description = html(selectors.description).text();

    // Get product categories (aka 'navigation breadcrumbs')
    html(selectors.categories).each((i, el) => {
        product.addCategory(html(el).text());
    });
    
    // Get product variations (aka 'skus')
    html(selectors.skus.main).each((i, el) => {
        let element = html(el);
        product.addSKU({
            name: element.find(selectors.skus.name).text(),
            current_price: currencyStringToNumber(
                element.find(selectors.skus.current_price).text()
            ),
            old_price: currencyStringToNumber(
                element.find(selectors.skus.old_price).text()
            ),
            available: !element.find(selectors.skus.available).text()
        });
    });

    // Get product properties
    html(selectors.properties.main).next().find('tbody').children().each((i, el) => {
        let element = html(el);
        product.addProperty({
            label: element.find('td b').text(),
            value: element.find('td').next().text()
        })
    });

    // Get additional product properties
    html(selectors.properties.additional).next().find('tbody').children().each((i, el) => {
        let element = html(el);
        product.addProperty({
            label: element.find('td b').text(),
            value: element.find('td').next().text()
        })
    });

    // Get product reviews
    html(selectors.reviews.main).each((i, el) => {
        let element = html(el);
        product.addReview({
            name: element.find(selectors.reviews.name).text(),
            date: element.find(selectors.reviews.date).text(),
            score: reviewStarsToNumber(
                element.find(selectors.reviews.score).text()
            ),
            text: element.find(selectors.reviews.text).text()
        });
    });

    // Save data to file
    fs.writeFile('./produto.json', product.toJSON(), err => {
        if (err) console.log('Error! [', err.message, ']');
        else console.log('Success!');
    });

    console.log( product.toJSON() )
})();
