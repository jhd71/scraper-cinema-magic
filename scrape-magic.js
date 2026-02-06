// scrape-magic.js - Scraper pour Cinéma Magic Le Creusot (v4 avec genre)
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const URL = 'https://www.cinemamagic-creusot.fr/horaires/';

async function scrapeCinema() {
    console.log('🎬 Démarrage du scraper Cinema Magic Le Creusot (v4)...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    console.log(`📡 Chargement de ${URL}`);
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Fermer popup cookies Didomi si présent
    try {
        const didomiButton = await page.$('#didomi-notice-agree-button');
        if (didomiButton) {
            await didomiButton.click();
            console.log('🍪 Popup cookies fermé');
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch (e) {
        console.log('Pas de popup cookies');
    }
    
    // Attendre les films
    await page.waitForSelector('.css-1fwauv0', { timeout: 30000 });
    console.log('✅ Films trouvés avec .css-1fwauv0');
    
    // Extraire les données
    const films = await page.evaluate(() => {
        const filmElements = document.querySelectorAll('.css-1fwauv0');
        const results = [];
        
        filmElements.forEach((filmEl) => {
            try {
                // Titre depuis l'attribut title du lien
                const linkEl = filmEl.querySelector('a[title]');
                const titre = linkEl ? linkEl.getAttribute('title') : '';
                
                if (!titre) return;
                
                // Affiche
                let affiche = '';
                const sourceEl = filmEl.querySelector('picture source');
                const imgEl = filmEl.querySelector('picture img');
                
                if (sourceEl && sourceEl.srcset) {
                    const srcset = sourceEl.srcset;
                    const match = srcset.match(/https:\/\/[^\s]+_500_x[^\s]+\.jpg/);
                    if (match) {
                        affiche = match[0];
                    } else {
                        const firstUrl = srcset.split(' ')[0];
                        if (firstUrl) affiche = firstUrl;
                    }
                }
                if (!affiche && imgEl && imgEl.src) {
                    affiche = imgEl.src;
                }
                
                // Genre - chercher le span avec "Genre :" et prendre le texte après
                let genre = 'Film';
                const allDivs = filmEl.querySelectorAll('.css-fqfb77 > div > div');
                allDivs.forEach(div => {
                    const text = div.textContent || '';
                    if (text.includes('Genre :')) {
                        // Extraire le genre après "Genre :"
                        genre = text.replace('Genre :', '').trim();
                    }
                });
                
                // Si pas trouvé, essayer une autre méthode
                if (genre === 'Film') {
                    const spans = filmEl.querySelectorAll('span.css-45pqov');
                    spans.forEach(span => {
                        if (span.textContent && span.textContent.includes('Genre')) {
                            const parent = span.parentElement;
                            if (parent) {
                                const fullText = parent.textContent || '';
                                genre = fullText.replace('Genre :', '').trim();
                            }
                        }
                    });
                }
                
                // Durée - chercher dans .css-uyt4dk span (format "1h 39min")
                let duree = '';
                const dureeSpans = filmEl.querySelectorAll('.css-uyt4dk span');
                dureeSpans.forEach(span => {
                    const text = span.textContent?.trim() || '';
                    // Chercher le format "Xh XXmin"
                    if (/^\d+h\s*\d*min?$/.test(text)) {
                        duree = text;
                    }
                });
                
                // Horaires
                const horaires = [];
                const timeElements = filmEl.querySelectorAll('time span');
                timeElements.forEach(time => {
                    const h = time.textContent?.trim();
                    if (h && /^\d{1,2}:\d{2}$/.test(h)) {
                        horaires.push(h);
                    }
                });
                
                // Si pas de time, chercher dans aria-label
                if (horaires.length === 0) {
                    const horaireLinks = filmEl.querySelectorAll('a[aria-label]');
                    horaireLinks.forEach(link => {
                        const label = link.getAttribute('aria-label');
                        if (label && /^\d{1,2}:\d{2}$/.test(label)) {
                            horaires.push(label);
                        }
                    });
                }
                
                if (horaires.length > 0) {
                    results.push({
                        titre,
                        genre,
                        duree,
                        horaires,
                        affiche
                    });
                }
            } catch (e) {
                console.log('Erreur extraction film:', e.message);
            }
        });
        
        return results;
    });
    
    await browser.close();
    
    // Sauvegarder
    const data = {
        cinema: 'Cinema Magic',
        ville: 'Le Creusot',
        date: new Date().toISOString().split('T')[0],
        scraped_at: new Date().toISOString(),
        films: films
    };
    
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(
        path.join(dataDir, 'cinema-magic.json'),
        JSON.stringify(data, null, 2)
    );
    
    console.log(`\n✅ ${films.length} films sauvegardés dans data/cinema-magic.json`);
    films.forEach(f => console.log(`   - ${f.titre} (${f.genre}) [${f.duree}] : ${f.horaires.join(', ')}`));
    
    return data;
}

scrapeCinema().catch(console.error);