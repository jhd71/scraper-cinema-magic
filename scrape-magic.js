const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeCinemaMagic() {
    console.log('🎬 Démarrage du scraping du Cinéma Magic Le Creusot...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    try {
        console.log('📡 Chargement de la page des horaires...');
        await page.goto('https://www.cinemamagic-creusot.fr/horaires/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        console.log('✅ Page chargée');
        
        // Fermer le popup cookies si présent
        try {
            await page.waitForSelector('.didomi-dismiss-button, .didomi-agree-button, [class*="didomi"]', { timeout: 5000 });
            await page.click('.didomi-dismiss-button').catch(() => {});
            await page.click('.didomi-agree-button').catch(() => {});
            console.log('🍪 Popup cookies fermé');
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (e) {
            console.log('ℹ️ Pas de popup cookies ou déjà fermé');
        }
        
        // Attendre que les films soient chargés
        await page.waitForSelector('.css-1fwauv0', { timeout: 30000 });
        console.log('✅ Films chargés');
        
        // Créer le dossier data
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data');
        }
        
        // Screenshot pour debug
        await page.screenshot({ path: 'data/screenshot.png', fullPage: true });
        console.log('📸 Screenshot sauvegardé');
        
        // Extraire les données des films
        const films = await page.evaluate(() => {
            const filmElements = document.querySelectorAll('.css-1fwauv0');
            const filmsData = [];
            
            filmElements.forEach((filmEl) => {
                try {
                    // TITRE - dans l'attribut title du lien <a>
                    const linkEl = filmEl.querySelector('a[title]');
                    const titre = linkEl ? linkEl.getAttribute('title') : '';
                    
                    // LIEN
                    let lien = 'https://www.cinemamagic-creusot.fr/horaires/';
                    if (linkEl && linkEl.getAttribute('href')) {
                        const href = linkEl.getAttribute('href');
                        lien = href.startsWith('http') ? href : 'https://www.cinemamagic-creusot.fr' + href;
                    }
                    
                    // AFFICHE
                    const imgEl = filmEl.querySelector('img');
                    const sourceEl = filmEl.querySelector('source');
                    let affiche = '';
                    if (imgEl && imgEl.src) {
                        affiche = imgEl.src;
                    } else if (sourceEl && sourceEl.srcset) {
                        // Prendre la première URL du srcset
                        affiche = sourceEl.srcset.split(' ')[0];
                    }
                    
                    // DURÉE et GENRE - chercher dans les spans/divs
                    let duree = '';
                    let genre = '';
                    
                    // Chercher tous les textes dans l'élément
                    const allText = filmEl.textContent;
                    
                    // Pattern pour durée: Xh XXmin ou X h XX min
                    const dureeMatch = allText.match(/(\d+\s*h\s*\d*\s*min|\d+h\d+)/i);
                    if (dureeMatch) {
                        duree = dureeMatch[0].trim();
                    }
                    
                    // HORAIRES - chercher les boutons/spans avec format HH:MM
                    const horaires = [];
                    
                    // Méthode 1: chercher tous les éléments time
                    const timeElements = filmEl.querySelectorAll('time, [datetime]');
                    timeElements.forEach(t => {
                        const text = t.textContent.trim();
                        if (/^\d{1,2}:\d{2}$/.test(text) && !horaires.includes(text)) {
                            horaires.push(text);
                        }
                    });
                    
                    // Méthode 2: chercher les boutons/spans avec horaires
                    if (horaires.length === 0) {
                        const buttons = filmEl.querySelectorAll('button, span, div');
                        buttons.forEach(btn => {
                            const text = btn.textContent.trim();
                            if (/^\d{1,2}:\d{2}$/.test(text) && !horaires.includes(text)) {
                                horaires.push(text);
                            }
                        });
                    }
                    
                    // Méthode 3: chercher dans tout le texte avec regex
                    if (horaires.length === 0) {
                        const horaireMatches = allText.match(/\b\d{1,2}:\d{2}\b/g);
                        if (horaireMatches) {
                            horaireMatches.forEach(h => {
                                if (!horaires.includes(h)) {
                                    horaires.push(h);
                                }
                            });
                        }
                    }
                    
                    // Ajouter seulement si on a un titre et au moins un horaire
                    if (titre && horaires.length > 0) {
                        filmsData.push({
                            titre: titre,
                            affiche: affiche,
                            lien: lien,
                            duree: duree,
                            genre: genre,
                            horaires: horaires
                        });
                    }
                } catch (e) {
                    console.error('Erreur extraction film:', e);
                }
            });
            
            return filmsData;
        });
        
        console.log(`🎬 ${films.length} films trouvés`);
        
        films.forEach((film, index) => {
            console.log(`  ${index + 1}. ${film.titre} - Horaires: ${film.horaires.join(', ')}`);
        });
        
        // Créer l'objet de données final
        const data = {
            cinema: {
                nom: "Magic",
                ville: "Le Creusot",
                adresse: "7 rue Hélène Boucher, 71200 Le Creusot",
                url: "https://www.cinemamagic-creusot.fr"
            },
            date: new Date().toISOString().split('T')[0],
            dateUpdate: new Date().toISOString(),
            films: films
        };
        
        // Sauvegarder le JSON
        fs.writeFileSync('data/cinema-magic.json', JSON.stringify(data, null, 2));
        console.log('✅ Données sauvegardées dans data/cinema-magic.json');
        
        // Sauvegarder le HTML pour debug
        const html = await page.content();
        fs.writeFileSync('data/page-debug.html', html);
        
    } catch (error) {
        console.error('❌ Erreur lors du scraping:', error);
        
        // Sauvegarder les fichiers de debug même en cas d'erreur
        try {
            if (!fs.existsSync('data')) {
                fs.mkdirSync('data');
            }
            const html = await page.content();
            fs.writeFileSync('data/page-error.html', html);
            await page.screenshot({ path: 'data/screenshot-error.png', fullPage: true });
        } catch (e) {
            console.error('Impossible de sauvegarder les fichiers de debug:', e);
        }
        
        // Créer un JSON vide
        const emptyData = {
            cinema: {
                nom: "Magic",
                ville: "Le Creusot",
                adresse: "7 rue Hélène Boucher, 71200 Le Creusot",
                url: "https://www.cinemamagic-creusot.fr"
            },
            date: new Date().toISOString().split('T')[0],
            dateUpdate: new Date().toISOString(),
            films: [],
            error: error.message
        };
        
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data');
        }
        fs.writeFileSync('data/cinema-magic.json', JSON.stringify(emptyData, null, 2));
        
    } finally {
        await browser.close();
        console.log('🔒 Navigateur fermé');
    }
}

scrapeCinemaMagic();