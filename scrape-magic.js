const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeCinemaMagic() {
    console.log('🎬 Démarrage du scraping du Cinéma Magic Le Creusot...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // User agent pour éviter d'être bloqué
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    try {
        console.log('📡 Chargement de la page des horaires...');
        await page.goto('https://www.cinemamagic-creusot.fr/horaires/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        // Attendre que les films soient chargés
        await page.waitForSelector('.film, .movie, [class*="film"], [class*="movie"], article', { timeout: 30000 });
        console.log('✅ Page chargée avec succès');
        
        // Capture d'écran pour debug
        await page.screenshot({ path: 'screenshot-magic.png', fullPage: true });
        console.log('📸 Screenshot sauvegardé');
        
        // Sauvegarder le HTML pour analyser la structure
        const html = await page.content();
        fs.writeFileSync('page-magic.html', html);
        console.log('📄 HTML sauvegardé dans page-magic.html');
        
        // Extraire les données des films
        // NOTE: Les sélecteurs devront peut-être être ajustés selon la structure réelle du site
        const films = await page.evaluate(() => {
            const filmsData = [];
            
            // Essayer plusieurs sélecteurs possibles
            const selectors = [
                '.css-1fwauv0',           // Style similaire au Capitole
                '.film-item',
                '.movie-item',
                '[class*="film"]',
                '[class*="movie"]',
                'article',
                '.seance',
                '.screening'
            ];
            
            let filmElements = [];
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    filmElements = elements;
                    console.log(`Sélecteur trouvé: ${selector} (${elements.length} éléments)`);
                    break;
                }
            }
            
            filmElements.forEach((filmEl) => {
                try {
                    // TITRE du film - essayer plusieurs sélecteurs
                    let titre = '';
                    const titreSelectors = ['h2', 'h3', '.title', '.film-title', '.movie-title', '[class*="title"]', 'a'];
                    for (const sel of titreSelectors) {
                        const el = filmEl.querySelector(sel);
                        if (el && el.textContent.trim()) {
                            titre = el.textContent.trim();
                            break;
                        }
                    }
                    
                    // AFFICHE du film
                    const imageEl = filmEl.querySelector('img');
                    const affiche = imageEl ? (imageEl.src || imageEl.getAttribute('data-src') || '') : '';
                    
                    // LIEN vers la fiche du film
                    const lienEl = filmEl.querySelector('a[href*="/film"]') || filmEl.querySelector('a');
                    let lien = 'https://www.cinemamagic-creusot.fr/horaires/';
                    if (lienEl) {
                        const href = lienEl.getAttribute('href');
                        if (href) {
                            lien = href.startsWith('http') ? href : 'https://www.cinemamagic-creusot.fr' + href;
                        }
                    }
                    
                    // DURÉE
                    let duree = '';
                    const dureeEl = filmEl.querySelector('[class*="duration"], [class*="duree"], .runtime, time');
                    if (dureeEl) {
                        duree = dureeEl.textContent.trim();
                    } else {
                        // Chercher un pattern de durée dans le texte
                        const text = filmEl.textContent;
                        const dureeMatch = text.match(/(\d+h\s*\d*|\d+\s*min)/i);
                        if (dureeMatch) duree = dureeMatch[0];
                    }
                    
                    // GENRE
                    let genre = '';
                    const genreEl = filmEl.querySelector('[class*="genre"], [class*="category"], .type');
                    if (genreEl) {
                        genre = genreEl.textContent.trim();
                    }
                    
                    // HORAIRES
                    const horaires = [];
                    const horaireSelectors = [
                        'time span',
                        '.time',
                        '.horaire',
                        '.seance-time',
                        '[class*="time"]',
                        '[class*="horaire"]',
                        'button[class*="time"]',
                        'span[class*="time"]'
                    ];
                    
                    for (const sel of horaireSelectors) {
                        const horaireElements = filmEl.querySelectorAll(sel);
                        if (horaireElements.length > 0) {
                            horaireElements.forEach(h => {
                                const horaire = h.textContent.trim();
                                // Vérifier que c'est bien un horaire (format HH:MM ou HHhMM)
                                if (horaire && /^\d{1,2}[h:]\d{2}$/.test(horaire) && !horaires.includes(horaire)) {
                                    horaires.push(horaire);
                                }
                            });
                            if (horaires.length > 0) break;
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
        
        // Afficher les films trouvés
        films.forEach((film, index) => {
            console.log(`  ${index + 1}. ${film.titre} - Horaires: ${film.horaires.join(', ')}`);
        });
        
        // Créer l'objet de données final
        const data = {
            cinema: {
                nom: "Magic",
                ville: "Le Creusot",
                adresse: "Le Creusot",
                url: "https://www.cinemamagic-creusot.fr"
            },
            date: new Date().toISOString().split('T')[0],
            dateUpdate: new Date().toISOString(),
            films: films
        };
        
        // Créer le dossier data s'il n'existe pas
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data');
        }
        
        // Sauvegarder le JSON
        fs.writeFileSync('data/cinema-magic.json', JSON.stringify(data, null, 2));
        console.log('✅ Données sauvegardées dans data/cinema-magic.json');
        
    } catch (error) {
        console.error('❌ Erreur lors du scraping:', error);
        
        // Créer un fichier JSON vide en cas d'erreur pour ne pas casser le site
        const emptyData = {
            cinema: {
                nom: "Magic",
                ville: "Le Creusot",
                adresse: "Le Creusot",
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
        
        process.exit(1);
    } finally {
        await browser.close();
        console.log('🔒 Navigateur fermé');
    }
}

scrapeCinemaMagic();
